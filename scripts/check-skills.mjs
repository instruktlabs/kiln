#!/usr/bin/env node
/**
 * Two checks that nothing else performs.
 *
 * First, the skill files are a published format now, not a local convention:
 * Agent Skills became an open standard whose `name` and `description` rules are
 * load-bearing for every harness that reads them. A violation is silent -- the
 * harness simply skips the skill -- so the constraints are asserted here.
 *
 * Second, a skill's bytes are becoming an addressable artifact rather than a local
 * file. SEP-2640 serves each file of a skill as an MCP resource and publishes a
 * per-file `{digest, size}` in `skills/list`, and this repository already publishes
 * sha256 digests of skill artifacts at `/.well-known/agent-skills/index.json` (7.13).
 * A digest is only a property of the content if the line endings are canonical, so
 * CRLF is rejected here. It had arrived by accident in seven files -- five fully
 * CRLF, two mixed -- and went unnoticed because the frontmatter parser below is
 * tolerant of both. Tolerant parsing is right; silently publishing a digest over
 * whichever ending an editor happened to write is not.
 *
 * Third, `skills/` is the maintained copy, but a bare clone registers nothing
 * from it: Claude Code scans only `.claude/skills/`, while codex, hermes and agy
 * scan `.agents/skills/` (opencode reads the `skills.paths` a workspace config
 * names). Those copies exist so a fresh clone has a working loadout, and copies
 * drift. Symlinks would avoid the duplication but need developer mode or an
 * administrator on Windows, so the files are real and this check is what keeps
 * them honest.
 *
 * Fourth, standing knowledge is a budget (v1 contract rule 12). Claude Code
 * re-injects at most about 5,000 tokens of a skill after compaction, and the
 * baseline sessions read the 19,000-character author skill whole before the first
 * call, so a SKILL.md is at most 16,000 characters and 500 lines. Codex read the
 * same reference file from two skills in one session, so every file under
 * `skills/` has one source: no two files may carry the same bytes.
 *
 * `node scripts/check-skills.mjs [root]` checks the repository, or the tree at
 * `root` (used by its test over a scratch copy).
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('..', import.meta.url));
const CANONICAL = 'skills';
/** Rule 12: what a harness keeps whole after compaction. */
const SKILL_CHARACTERS = 16_000;
const SKILL_LINES = 500;
/** Skills that must also be registered at the repository root, and where. */
const REGISTERED = ['kiln-setup-workspace'];
const REGISTRIES = ['.claude/skills', '.agents/skills'];
const SPEC_KEYS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]);

const errors = [];

/** Files under `dir`, relative to it, sorted, recursing into subdirectories. */
async function tree(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await tree(full)).map((p) => join(entry.name, p)));
    else out.push(entry.name);
  }
  return out.sort();
}

function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text);
  if (!match) return null;
  const fields = new Map();
  for (const line of match[1].split(/\r?\n/u)) {
    const kv = /^([A-Za-z-]+):\s*(.*)$/u.exec(line);
    if (kv) fields.set(kv[1], kv[2]);
  }
  return fields;
}

/** The specification's own constraints, applied to one skill directory. */
async function validate(label, dir, name) {
  const file = join(dir, 'SKILL.md');
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    errors.push(`${label}: missing SKILL.md`);
    return;
  }
  const fields = frontmatter(text);
  if (!fields) {
    errors.push(`${label}: SKILL.md has no YAML frontmatter`);
    return;
  }
  const declared = fields.get('name');
  const description = fields.get('description');
  if (declared !== name) {
    errors.push(
      `${label}: name is ${declared ?? '(absent)'} but must match the directory, ${name}`,
    );
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(name) || name.length > 64) {
    errors.push(`${label}: name must be 1-64 lowercase alphanumerics with single hyphens`);
  }
  if (!description) errors.push(`${label}: description is required`);
  else if (description.length > 1024) {
    errors.push(`${label}: description is ${description.length} characters, over the 1024 maximum`);
  }
  for (const key of fields.keys()) {
    if (!SPEC_KEYS.has(key))
      errors.push(`${label}: ${key} is not an Agent Skills frontmatter field`);
  }
  const lines = text.split(/\r?\n/u).length;
  if (lines > SKILL_LINES)
    errors.push(`${label}: SKILL.md is ${lines} lines, over the ${SKILL_LINES} of rule 12`);
  if (text.length > SKILL_CHARACTERS)
    errors.push(
      `${label}: SKILL.md is ${text.length} characters, over the ${SKILL_CHARACTERS.toLocaleString('en-US')} a harness keeps whole (rule 12); move detail into a reference file`,
    );
}

/** Rule 12: every file under the maintained tree has one source. */
async function checkOneSource(dir) {
  const byDigest = new Map();
  for (const file of await tree(dir)) {
    const digest = createHash('sha256')
      .update(await readFile(join(dir, file)))
      .digest('hex');
    const seen = byDigest.get(digest);
    const posix = (name) => name.replaceAll('\\', '/');
    if (seen)
      errors.push(
        `${CANONICAL}/${posix(file)} has the same bytes as ${CANONICAL}/${posix(seen)}; keep one source and name it by skill and path from the other (a markdown link must stay inside its skill)`,
      );
    else byDigest.set(digest, file);
  }
}

/**
 * Fifth, rule 7's default has to hold in practice. The wave sessions of 1 October
 * 2026 (OpenCode, both the compact and the lean arm) asked `detail: "full"` on
 * every render and edit because the skills said to pass it "for every finding",
 * so the bounded default never reached the model. A skill may name full detail
 * only as a qualified second look: every sentence that names it says "only".
 */
async function checkFullDetail(label, dir) {
  for (const file of await tree(dir)) {
    if (!file.endsWith('.md')) continue;
    const text = await readFile(join(dir, file), 'utf8');
    for (const sentence of text.split(/(?<=[.!?])\s+|\r?\n/u)) {
      if (!/detail: ?"full"|--detail full/u.test(sentence)) continue;
      if (!/\bonly\b/u.test(sentence))
        errors.push(
          `${label}/${file.replaceAll('\\', '/')}: "${sentence.trim().slice(0, 90)}" names full detail without "only"; the compact result is the way to review (rule 7) and full is a qualified second look`,
        );
    }
  }
}

/** Every file of a skill, rejected if its bytes are not canonically LF. */
async function checkLineEndings(label, dir) {
  for (const file of await tree(dir)) {
    const bytes = await readFile(join(dir, file));
    if (bytes.includes('\r\n')) errors.push(`${label}/${file}: CRLF; skill bytes must be LF`);
  }
}

const canonicalDir = join(repo, CANONICAL);
const names = (await readdir(canonicalDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (names.length === 0) errors.push(`${CANONICAL}/ contains no skills`);
for (const name of names) {
  await validate(`${CANONICAL}/${name}`, join(canonicalDir, name), name);
  await checkLineEndings(`${CANONICAL}/${name}`, join(canonicalDir, name));
  await checkFullDetail(`${CANONICAL}/${name}`, join(canonicalDir, name));
}
await checkOneSource(canonicalDir);

for (const registry of REGISTRIES) {
  const dir = join(repo, registry);
  try {
    await stat(dir);
  } catch {
    errors.push(`${registry}/ is missing; a bare clone would register no skills there`);
    continue;
  }
  const present = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expected = [...REGISTERED].sort();
  if (present.join(',') !== expected.join(',')) {
    errors.push(
      `${registry}/ holds [${present.join(', ')}] but must hold exactly [${expected.join(', ')}]`,
    );
  }
  for (const name of expected) {
    if (!present.includes(name)) continue;
    await validate(`${registry}/${name}`, join(dir, name), name);
    await checkLineEndings(`${registry}/${name}`, join(dir, name));
    const from = join(canonicalDir, name);
    const to = join(dir, name);
    const [a, b] = await Promise.all([tree(from), tree(to)]);
    if (a.join('\n') !== b.join('\n')) {
      errors.push(`${registry}/${name} has a different file list than ${CANONICAL}/${name}`);
      continue;
    }
    for (const file of a) {
      const [left, right] = await Promise.all([
        readFile(join(from, file)),
        readFile(join(to, file)),
      ]);
      if (!left.equals(right)) {
        errors.push(
          `${relative(repo, join(to, file))} differs from ${relative(repo, join(from, file))}; copy the maintained file over it`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const mirrored = REGISTERED.length * REGISTRIES.length;
console.log(
  `Skills: ${names.length} conform to the Agent Skills specification; ${mirrored} registered copies are byte-identical.`,
);
