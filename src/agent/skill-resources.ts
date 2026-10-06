import { lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { Skill } from '@strands-agents/sdk/vended-plugins/skills';
import type { SkillResourceReader } from '../tools/skill-resource';
export type { SkillResourceReader, SkillResourceRequest } from '../tools/skill-resource';

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const MAX_FILES = 128;
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.js', '.mjs', '.ts']);

/** Host-selected local skills and text references become an immutable per-run snapshot.
 * Model input only selects keys in the snapshot, never filesystem paths. */
export async function loadNativeSkills(selected: string): Promise<{
  skills: Skill[];
  read: SkillResourceReader;
}> {
  if (/^[a-z]+:\/\//i.test(selected))
    throw new Error('Native skillDir must be a local skill directory, not a URL.');
  const root = await realpath(resolve(selected)).catch(() => {
    throw new Error(`Native skill directory is unavailable: ${selected}`);
  });
  const info = await stat(root);
  const directories =
    info.isFile() && basename(root) === 'SKILL.md'
      ? [dirname(root)]
      : info.isDirectory() &&
          (await stat(join(root, 'SKILL.md')).then(
            (s) => s.isFile(),
            () => false,
          ))
        ? [root]
        : info.isDirectory()
          ? (await readdir(root, { withFileTypes: true }))
              .filter((e) => e.isDirectory())
              .map((e) => join(root, e.name))
              .sort()
          : [];
  const snapshots = new Map<string, Map<string, { text: string; sha256: string; bytes: number }>>();
  const skills: Skill[] = [];
  const referenceCollections: { skill: string; paths: string[] }[] = [];
  let total = 0;
  let files = 0;
  async function textFile(path: string): Promise<string> {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error(`Skill reference must be a regular file: ${path}`);
    if (info.size > MAX_FILE_BYTES || total + info.size > MAX_TOTAL_BYTES || ++files > MAX_FILES)
      throw new Error(
        'Native skill snapshot exceeds the 256 KiB/file, 1 MiB total or 128-file limit.',
      );
    // Bounded reads also cap allocation if a host edit grows the file after stat.
    const capacity = Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - total) + 1;
    const buffer = Buffer.alloc(capacity);
    const handle = await open(path, 'r');
    let size = 0;
    try {
      while (size < capacity) {
        const { bytesRead } = await handle.read(buffer, size, capacity - size, size);
        if (!bytesRead) break;
        size += bytesRead;
      }
    } finally {
      await handle.close();
    }
    if (size === capacity) throw new Error('Native skill snapshot exceeds its byte limit.');
    total += size;
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size));
  }
  for (const directory of directories) {
    const file = join(directory, 'SKILL.md');
    if (
      !(await stat(file).then(
        (s) => s.isFile(),
        () => false,
      ))
    )
      continue;
    const parsed = Skill.fromContent(await textFile(file), { strict: true, path: directory });
    if (snapshots.has(parsed.name)) throw new Error(`Duplicate native skill name: ${parsed.name}`);
    const workspace = parsed.metadata['kiln-workflow'] === 'workspace';
    const declaration = parsed.metadata['kiln-shared-references'] ?? '';
    if (workspace && typeof declaration !== 'string')
      throw new Error('kiln-shared-references must be a space-separated list of reference paths.');
    const shared = workspace
      ? new Set((declaration as string).split(/\s+/).filter(Boolean))
      : undefined;
    const references = new Map<string, { text: string; sha256: string; bytes: number }>();
    async function walk(folder: string, depth: number): Promise<void> {
      if (depth > 8) throw new Error('Native skill references exceed the 8-level directory limit.');
      const entries = await readdir(folder, { withFileTypes: true });
      if (entries.length > 128)
        throw new Error('Native skill reference directory exceeds 128 entries.');
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(folder, entry.name);
        if (entry.isSymbolicLink())
          throw new Error(`Symlinked native skill reference is unsupported: ${entry.name}`);
        if (entry.isDirectory()) {
          await walk(path, depth + 1);
          continue;
        }
        if (!TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
        const resourcePath = relative(directory, path).split(sep).join('/');
        if (shared && !shared.has(resourcePath)) continue;
        const canonical = await realpath(path);
        const rel = relative(directory, canonical);
        if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(directory, rel) !== canonical)
          throw new Error('Native skill reference leaves its configured directory.');
        const text = await textFile(canonical);
        references.set(resourcePath, {
          text,
          sha256: `sha256:${createHash('sha256').update(text).digest('hex')}`,
          bytes: Buffer.byteLength(text),
        });
      }
    }
    const referenceDir = join(directory, 'references');
    const referenceInfo = await lstat(referenceDir).catch(() => undefined);
    if (referenceInfo?.isSymbolicLink())
      throw new Error('Symlinked native skill references directory is unsupported.');
    if (referenceInfo?.isDirectory()) await walk(referenceDir, 0);
    for (const path of shared ?? [])
      if (!references.has(path))
        throw new Error(`Shared technical reference is unavailable: ${path}`);
    snapshots.set(parsed.name, references);
    if (workspace) {
      // Share the technical files, never activate another harness's workflow and
      // then ask the model to ignore its setup/export/completion instructions.
      if (references.size)
        referenceCollections.push({ skill: parsed.name, paths: [...references.keys()] });
      continue;
    }
    // SDK activation remains lazy; references are available only through the bounded reader.
    skills.push(
      new Skill({
        name: parsed.name,
        description: parsed.description,
        instructions: `${parsed.instructions}\n\nRead listed references with kiln_skill_resource({ skill: ${JSON.stringify(parsed.name)}, path: "references/FILE" }). Omit path to list available files. Only reference text is exposed; scripts are not executed.`,
      }),
    );
  }
  if (referenceCollections.length) {
    if (skills.some((skill) => skill.name === 'kiln-modeling-references'))
      throw new Error(
        'kiln-modeling-references is reserved for configured workspace reference collections.',
      );
    skills.push(
      new Skill({
        name: 'kiln-modeling-references',
        description:
          'Find configured program, geometry, camera, revision and QA reference documents when an exact tool contract is insufficient.',
        instructions: `Read the relevant technical document with kiln_skill_resource({skill: COLLECTION, path: PATH}). These are immutable reference snapshots; use kiln_discover for current helper contracts. Available collections:\n${referenceCollections.map((collection) => `${collection.skill}: ${collection.paths.join(', ')}`).join('\n')}`,
      }),
    );
  }
  if (!skills.length)
    throw new Error(
      'No valid native skills or technical references found in the configured skillDir.',
    );
  return {
    skills,
    read(input) {
      const resources = snapshots.get(input.skill);
      if (!resources) throw new Error(`Unknown configured skill: ${input.skill}`);
      if (input.path === undefined)
        return {
          version: 'kiln.skill-resource.v1',
          skill: input.skill,
          resources: [...resources].map(([path, value]) => ({
            path,
            sha256: value.sha256,
            bytes: value.bytes,
            characters: value.text.length,
          })),
        };
      const file = resources.get(input.path);
      if (!file)
        throw new Error(
          'Unknown skill reference. List available references first; arbitrary filesystem access is unavailable.',
        );
      if (input.offset > file.text.length)
        throw new Error('Skill reference offset exceeds its length.');
      const end = Math.min(file.text.length, input.offset + input.limit);
      return {
        version: 'kiln.skill-resource.v1',
        skill: input.skill,
        path: input.path,
        sha256: file.sha256,
        bytes: file.bytes,
        characters: file.text.length,
        offset: input.offset,
        nextOffset: end < file.text.length ? end : null,
        text: file.text.slice(input.offset, end),
      };
    },
  };
}
