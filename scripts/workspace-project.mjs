/** Shared project adoption and maintenance, independent of any one agent client. */
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getNodeValue, parseTree } from 'jsonc-parser';
import { mergeJsonConfig, mergeTomlConfig } from './workspace-config.mjs';
import { applyProjectEdits, readProjectFile } from './workspace-transaction.mjs';

const hash = (value) =>
  value === undefined ? undefined : createHash('sha256').update(value).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/;
const text = (value, name) => {
  try {
    return value === undefined ? '' : new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw new Error(`Invalid UTF-8 project configuration: ${name}`);
  }
};
const descriptorKey = (value) => JSON.stringify([value.file, value.path]);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);

function configProjection(file, body) {
  if (file === '.codex/config.toml')
    return [{ file, kind: 'toml', path: ['mcp_servers', 'kiln_workspace'], fragment: body }];
  if (file === 'opencode.json') {
    const value = JSON.parse(body);
    return [
      {
        file,
        kind: 'json',
        path: ['mcp', 'kiln_workspace'],
        value: value.mcp.kiln_workspace,
        comments: true,
      },
      {
        file,
        kind: 'json-list',
        path: ['skills', 'paths'],
        value: value.skills.paths[0],
        comments: true,
      },
    ];
  }
  if (['.mcp.json', '.cursor/mcp.json', '.agents/mcp_config.json'].includes(file))
    return [
      {
        file,
        kind: 'json',
        path: ['mcpServers', 'kiln_workspace'],
        value: JSON.parse(body).mcpServers.kiln_workspace,
      },
    ];
  return [];
}

function validatePrevious(previous, allowedNames, skills, knownConfigs, allowedHarnesses) {
  if (!previous) return;
  if (![1, 2].includes(previous.schemaVersion))
    throw new Error('Unsupported workspace manifest version.');
  if (!allowedHarnesses.includes(previous.harness))
    throw new Error('Invalid workspace harness manifest.');
  const ownedName = (name) => {
    if (
      typeof name !== 'string' ||
      name.includes('\\') ||
      name.includes(':') ||
      name.split('/').some((p) => !p || p === '.' || p === '..')
    )
      return false;
    if (allowedNames.has(name)) return true;
    for (const prefix of ['skills/', '.claude/skills/', '.agents/skills/']) {
      if (name.startsWith(prefix) && skills.includes(name.slice(prefix.length).split('/')[0]))
        return true;
    }
    return false;
  };
  for (const map of [previous.ownedFiles, previous.managedHashes, previous.generated]) {
    if (
      map !== undefined &&
      (!object(map) ||
        Object.entries(map).some(
          ([name, value]) =>
            !ownedName(name) || typeof value !== 'string' || !digestPattern.test(value),
        ))
    )
      throw new Error('Invalid managed-file manifest.');
  }
  if (previous.schemaVersion === 2) {
    if (!Array.isArray(previous.configEntries) || previous.configEntries.length > 32)
      throw new Error('Invalid configuration ownership manifest.');
    const seen = new Set();
    for (const entry of previous.configEntries) {
      const key = descriptorKey(entry);
      if (!knownConfigs.has(key) || entry.kind !== knownConfigs.get(key).kind || seen.has(key))
        throw new Error('Invalid configuration ownership manifest.');
      seen.add(key);
    }
  }
}

function listValue(content, path) {
  const errors = [];
  const tree = parseTree(content, errors, { allowTrailingComma: true });
  if (errors.length || tree?.type !== 'object') throw new Error('Invalid JSON configuration.');
  let value = getNodeValue(tree);
  for (const part of path) {
    if (!object(value)) throw new Error('Configuration conflict at skills.paths.');
    value = value[part];
    if (value === undefined) return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error('Configuration conflict at skills.paths.');
  return value;
}

/** All side effects go through one validated transaction after the complete plan is built. */
export async function setupProject({
  root,
  runtime,
  harness,
  previous,
  metadata,
  exists,
  options,
  projectFiles,
  skillFiles,
  guide,
  startGuide,
  allowedHarnesses,
}) {
  if (
    previous?.schemaVersion === 2 &&
    (!Array.isArray(previous.harnesses) ||
      !previous.harnesses.includes(previous.harness) ||
      previous.harnesses.some((name) => !allowedHarnesses.includes(name)) ||
      new Set(previous.harnesses).size !== previous.harnesses.length)
  )
    throw new Error('Invalid workspace harness manifest.');
  const selected =
    previous?.schemaVersion === 2 ? [...previous.harnesses] : previous ? [previous.harness] : [];
  if (options.adopt || !previous) selected.push(harness);
  const registrations = [...new Set(selected)].sort();
  const projection = new Map();
  const desired = {};
  const runtimeFiles = new Set();
  const knownConfigs = new Map();
  const allowedNames = new Set([
    'AGENTS.md',
    'CLAUDE.md',
    'START.md',
    '.kiln/AGENTS.md',
    '.kiln/START.md',
    '.kiln/.gitignore',
  ]);
  for (const name of allowedHarnesses) {
    for (const [file, body] of Object.entries(projectFiles(name))) {
      allowedNames.add(file);
      for (const descriptor of configProjection(file, body))
        knownConfigs.set(descriptorKey(descriptor), descriptor);
    }
  }
  validatePrevious(previous, allowedNames, metadata.skills, knownConfigs, allowedHarnesses);
  const snapshots = new Map();
  const read = async (name) => {
    if (!snapshots.has(name))
      snapshots.set(name, exists ? await readProjectFile(root, name) : undefined);
    return snapshots.get(name);
  };
  for (const name of registrations) {
    for (const [file, body] of Object.entries(projectFiles(name))) {
      const descriptors = configProjection(file, body);
      if (!descriptors.length) {
        desired[file] = body;
        runtimeFiles.add(file);
        continue;
      }
      for (const descriptor of descriptors) {
        const key = descriptorKey(descriptor);
        if (
          projection.has(key) &&
          JSON.stringify(projection.get(key)) !== JSON.stringify(descriptor)
        )
          throw new Error(
            `The selected clients require conflicting configuration at ${file}. Keep their registrations separate until a compatible adapter is available.`,
          );
        projection.set(key, descriptor);
      }
    }
  }
  const configFiles = new Set([...knownConfigs.values()].map((entry) => entry.file));
  const original =
    previous?.schemaVersion === 2
      ? { ...previous.ownedFiles }
      : { ...previous?.generated, ...previous?.managedHashes };
  if (previous?.schemaVersion === 1) {
    for (const [name, value] of Object.entries(previous.skillHashes ?? {})) {
      if (typeof value !== 'string' || !digestPattern.test(value))
        throw new Error('Invalid skill manifest.');
      for (const folder of ['skills', '.claude/skills', '.agents/skills']) {
        const path = `${folder}/${name}`;
        // Validate before reading paths from an older manifest.
        validatePrevious(
          { schemaVersion: 1, harness: previous.harness, generated: { [path]: value } },
          allowedNames,
          metadata.skills,
          knownConfigs,
          allowedHarnesses,
        );
        if ((await read(path)) !== undefined) original[path] ??= value;
      }
    }
  }
  for (const file of configFiles) delete original[file];
  desired['.kiln/AGENTS.md'] = guide;
  desired['.kiln/START.md'] = registrations.map((name) => startGuide(name)).join('\n---\n\n');
  desired['.kiln/.gitignore'] = 'programs/\n';
  const preserved = [];
  for (const [file, body] of Object.entries({
    'AGENTS.md': guide,
    'CLAUDE.md':
      (await read('AGENTS.md')) === undefined || original['AGENTS.md']
        ? '@AGENTS.md\n'
        : '@AGENTS.md\n@.kiln/AGENTS.md\n',
    'START.md': desired['.kiln/START.md'],
  })) {
    if ((await read(file)) === undefined || original[file]) desired[file] = body;
    else preserved.push(file);
  }
  const registries = new Set(['skills']);
  for (const name of registrations) {
    if (name === 'claude') registries.add('.claude/skills');
    else if (name !== 'opencode') registries.add('.agents/skills');
  }
  const skillHashes = {};
  for (const [name, body] of Object.entries(await skillFiles()).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    skillHashes[name] = hash(body);
    for (const folder of registries) desired[`${folder}/${name}`] = body;
  }
  const edits = [],
    files = [],
    ownedFiles = {};
  for (const name of [...new Set([...Object.keys(original), ...Object.keys(desired)])].sort()) {
    if (options.repair && previous && !runtimeFiles.has(name)) {
      if (original[name] !== undefined) ownedFiles[name] = original[name];
      continue;
    }
    const before = await read(name);
    const after = desired[name] === undefined ? undefined : Buffer.from(desired[name]);
    const localHash = hash(before),
      desiredHash = hash(after),
      previousHash = original[name];
    const status =
      localHash === desiredHash
        ? 'current'
        : before === undefined
          ? 'missing'
          : localHash === previousHash
            ? after === undefined
              ? 'retired'
              : 'outdated'
            : previousHash === desiredHash && after !== undefined
              ? 'customized'
              : 'conflict';
    if (after !== undefined) ownedFiles[name] = desiredHash;
    if (status !== 'current') files.push({ path: name, status });
    if (!['current', 'customized', 'conflict'].includes(status))
      edits.push({ path: name, before, after });
  }
  const previousEntries = new Map(
    (previous?.configEntries ?? []).map((value) => [descriptorKey(value), value]),
  );
  const configEntries = [...projection.values()];
  for (const file of [...new Set(configEntries.map((entry) => entry.file))].sort()) {
    const before = await read(file);
    try {
      let merged = text(before, file);
      const legacyOwned =
        previous?.schemaVersion === 1 &&
        before !== undefined &&
        hash(before) === (previous.generated?.[file] ?? previous.managedHashes?.[file]);
      for (const entry of configEntries.filter((value) => value.file === file)) {
        let prior = previousEntries.get(descriptorKey(entry));
        if (entry.kind === 'toml') {
          if (legacyOwned) merged = '';
          merged = mergeTomlConfig(merged, {
            path: entry.path,
            fragment: entry.fragment,
            ...(prior ? { previous: prior.fragment } : {}),
          });
        } else if (entry.kind === 'json') {
          if (legacyOwned) {
            let value = JSON.parse(text(before, file));
            for (const part of entry.path) value = value?.[part];
            if (value !== undefined) prior = { value };
          }
          merged = mergeJsonConfig(
            merged,
            [{ path: entry.path, value: entry.value, ...(prior ? { previous: prior.value } : {}) }],
            { comments: entry.comments === true },
          );
        } else {
          const current = listValue(merged, entry.path);
          const oldPath = prior?.value;
          const value = current.filter((item) => item !== oldPath || oldPath === entry.value);
          if (!value.includes(entry.value)) value.push(entry.value);
          merged = mergeJsonConfig(merged, [{ path: entry.path, value, previous: current }], {
            comments: true,
          });
        }
      }
      if (before === undefined || !before.equals(Buffer.from(merged))) {
        files.push({ path: file, status: before === undefined ? 'missing' : 'outdated' });
        edits.push({ path: file, before, after: merged });
      }
    } catch {
      files.push({ path: file, status: 'conflict' });
    }
  }
  const next = {
    schemaVersion: 2,
    root,
    harness: previous?.harness ?? harness,
    harnesses: registrations,
    runtime,
    runtimeVersion: metadata.runtimeVersion,
    buildIdentity: metadata.buildIdentity,
    runtimeHashes: metadata.runtimeHashes,
    node: metadata.node,
    skills: metadata.skills,
    skillHashes: options.repair && previous ? previous.skillHashes : skillHashes,
    ownedFiles,
    configEntries,
  };
  const manifestBefore = await read('.kiln/workspace.json');
  const manifestAfter = JSON.stringify(next);
  const runtimeChanged =
    !!previous &&
    (previous.runtime !== runtime ||
      previous.node !== next.node ||
      previous.runtimeVersion !== next.runtimeVersion ||
      (previous.buildIdentity ?? previous.runtimeIdentity) !== next.buildIdentity ||
      JSON.stringify(previous.runtimeHashes) !== JSON.stringify(next.runtimeHashes) ||
      (previous.schemaVersion === 2 && previous.root !== root));
  const manifestChanged =
    manifestBefore === undefined || !manifestBefore.equals(Buffer.from(manifestAfter));
  if (manifestChanged)
    edits.push({ path: '.kiln/workspace.json', before: manifestBefore, after: manifestAfter });
  const conflicts = files.filter((file) => file.status === 'conflict');
  const report = {
    root,
    runtime,
    harness: next.harness,
    harnesses: registrations,
    store: join(root, '.kiln', 'programs'),
    server: join(runtime, 'dist', 'mcp-server.mjs'),
    instructions: join(root, '.kiln', 'AGENTS.md'),
    status: edits.length || conflicts.length || runtimeChanged ? 'update-required' : 'current',
    runtimeChanged,
    files,
    preserved,
    next: 'Stop active agent/MCP sessions before setup changes. Restart afterward and accept the normal project and MCP trust prompts.',
  };
  if (options.check) {
    if (exists && !conflicts.length)
      await applyProjectEdits(root, edits, { stateDirectory: options.stateDirectory, check: true });
    return report;
  }
  if (conflicts.length)
    throw new Error(
      `Project setup has conflicts; no files were changed: ${conflicts.map((file) => file.path).join(', ')}. Preserve and resolve these files before retrying.`,
    );
  if (!exists) await mkdir(root, { recursive: true });
  await applyProjectEdits(root, edits, {
    stateDirectory: options.stateDirectory,
    onStep: options.onStep,
  });
  return { ...report, status: 'current', changed: edits.map((edit) => edit.path) };
}
