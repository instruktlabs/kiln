/** Recoverable setup writes. Private recovery data never enters diagnostics. */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  link,
  lstat as nativeLstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

const active = new Set();
const lstat = (path) => nativeLstat(path, { bigint: true });
const maxFile = 2 * 1024 * 1024;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const key = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
const inside = (parent, child) => {
  const rel = relative(key(parent), key(child));
  return !rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
};
const equal = (a, b) => (a === undefined ? b === undefined : b !== undefined && a.equals(b));
const maybeStat = async (path) => {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
};

function safePath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 1024 ||
    value
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[\\:*?"<>|]/.test(part) ||
          [...part].some((character) => character.charCodeAt(0) < 32) ||
          /[. ]$/.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part) ||
          /^\.git$/i.test(part),
      )
  )
    throw new Error('Unsafe project path.');
  return value;
}

async function inspectPath(root, name) {
  safePath(name);
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink()) throw new Error('Refusing symbolic link at the project root.');
  if (!rootInfo.isDirectory()) throw new Error('Project root must remain a directory.');
  let path = root;
  const parts = name.split('/');
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i]);
    const info = await maybeStat(path);
    if (!info) return undefined;
    if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link in project path: ${name}`);
    if (i !== parts.length - 1 && !info.isDirectory())
      throw new Error(`Not a directory in project path: ${name}`);
    if (i === parts.length - 1) return info;
  }
}

async function readSafe(root, name) {
  const info = await inspectPath(root, name);
  if (!info) return undefined;
  if (!info.isFile() || info.nlink !== 1n)
    throw new Error(`Expected a single regular file: ${name}`);
  if (info.size > maxFile) throw new Error(`Project file exceeds setup size limit: ${name}`);
  const handle = await open(join(root, name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const current = await handle.stat({ bigint: true });
    if (current.dev !== info.dev || current.ino !== info.ino || current.size > maxFile)
      throw new Error(`Project file changed: ${name}`);
    const data = await handle.readFile();
    if (data.length > maxFile) throw new Error(`Project file exceeds setup size limit: ${name}`);
    return data;
  } finally {
    await handle.close();
  }
}

export async function readProjectFile(root, name) {
  if ((await lstat(root)).isSymbolicLink())
    throw new Error('Refusing symbolic link at the project root.');
  return readSafe(await realpath(root), name);
}

async function paths(root, stateDirectory) {
  if ((await lstat(root)).isSymbolicLink())
    throw new Error('Refusing symbolic link at the project root.');
  root = await realpath(root);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) throw new Error('Project root must be a directory.');
  const base =
    process.platform === 'win32'
      ? join(
          process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
          'InstruktLabs',
          'Kiln',
        )
      : join(
          process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
          'instruktlabs',
          'kiln',
        );
  const state = resolve(stateDirectory ?? join(base, 'setup-transactions'));
  // A junction in any existing ancestor must not redirect private backups.
  let current = parse(state).root;
  for (const part of relative(current, state).split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await maybeStat(current);
    if (info?.isSymbolicLink()) throw new Error('Refusing symbolic link in recovery storage.');
    if (info && !info.isDirectory()) throw new Error('Recovery storage must be a directory.');
  }
  if (inside(root, state) || inside(state, root))
    throw new Error('Recovery storage must be outside the project.');
  const directory = join(state, digest(key(root)));
  return { root, state, directory, rootInfo };
}

async function assertRoot(root, journal) {
  const info = await lstat(root);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    String(info.dev) !== journal.rootDev ||
    String(info.ino) !== journal.rootIno
  )
    throw new Error('Project root changed during setup.');
}

async function durableWrite(path, value, mode = 0o600) {
  const handle = await open(path, 'wx', mode);
  try {
    await handle.writeFile(value);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function saveJournal(directory, journal) {
  const pending = join(directory, 'journal.pending');
  await unlink(pending).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await durableWrite(pending, JSON.stringify(journal));
  await rename(pending, join(directory, 'journal.json'));
}

function bytes(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' && !Buffer.isBuffer(value))
    throw new Error('Setup edits require text or bytes.');
  const result = Buffer.from(value);
  if (result.length > maxFile) throw new Error('Setup edit exceeds size limit.');
  return result;
}

async function ensureParents(root, name, journal, directory) {
  const parts = name.split('/').slice(0, -1);
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join('/');
    const info = await inspectPath(root, path);
    if (info) {
      if (!info.isDirectory()) throw new Error(`Not a directory in project path: ${path}`);
      continue;
    }
    await mkdir(join(root, path));
    const created = await lstat(join(root, path));
    journal.directories.push({ path, dev: String(created.dev), ino: String(created.ino) });
    await saveJournal(directory, journal);
  }
}

function stageName(journal, entry) {
  return [
    ...entry.path.split('/').slice(0, -1),
    `.kiln-setup-${journal.id}-${entry.index}.tmp`,
  ].join('/');
}

async function replaceFile(root, entry, before, after, journal, directory) {
  await assertRoot(root, journal);
  if (!equal(await readSafe(root, entry.path), before))
    throw new Error(`Project file changed: ${entry.path}`);
  if (after === undefined) {
    await unlink(join(root, entry.path));
    return;
  }
  await ensureParents(root, entry.path, journal, directory);
  const temporary = stageName(journal, entry);
  await inspectPath(root, temporary);
  await durableWrite(join(root, temporary), after);
  if (entry.mode !== undefined) await chmod(join(root, temporary), entry.mode);
  // Recheck after staging. A new destination must not replace a concurrent arrival.
  if (!equal(await readSafe(root, entry.path), before))
    throw new Error(`Project file changed: ${entry.path}`);
  if (before === undefined) {
    await link(join(root, temporary), join(root, entry.path));
    await unlink(join(root, temporary));
  } else {
    await rename(join(root, temporary), join(root, entry.path));
  }
}

async function storedBytes(directory, entry, side) {
  if (entry[side] === null) return undefined;
  const value = await readSafe(directory, `${entry.index}.${side}`);
  if (value === undefined || digest(value) !== entry[side])
    throw new Error('Recovery data failed integrity verification.');
  return value;
}

async function removeTemporary(root, journal, entry) {
  const name = stageName(journal, entry);
  const info = await inspectPath(root, name);
  if (!info) return;
  // Two links are possible if a process stopped between exclusive publication and unlink.
  if (!info.isFile() || info.size > maxFile) throw new Error(`Recovery conflict at ${name}`);
  const value = await readFile(join(root, name));
  if (![entry.before, entry.after].includes(digest(value)))
    throw new Error(`Recovery conflict at ${name}`);
  await unlink(join(root, name));
}

async function cleanState(directory, journal, recovery = false) {
  // Never recursively delete private storage.
  const known = new Set([
    'journal.pending',
    'journal.json',
    ...(recovery ? ['recovery.lock'] : []),
  ]);
  for (const entry of journal.entries)
    for (const side of ['before', 'after']) known.add(`${entry.index}.${side}`);
  if ((await readdir(directory)).some((name) => !known.has(name)))
    throw new Error('Unexpected recovery file; private recovery data was retained.');
  for (const entry of journal.entries) {
    for (const side of ['before', 'after']) {
      await unlink(join(directory, `${entry.index}.${side}`)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
  for (const name of ['journal.pending', 'journal.json', ...(recovery ? ['recovery.lock'] : [])]) {
    await unlink(join(directory, name)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  await rmdir(directory);
}

async function rollback(root, directory, journal, recovery = false) {
  await assertRoot(root, journal);
  const restore = [];
  for (const entry of journal.entries.filter((item) => item.started)) {
    const before = await storedBytes(directory, entry, 'before');
    const after = await storedBytes(directory, entry, 'after');
    await removeTemporary(root, journal, entry);
    const current = await readSafe(root, entry.path);
    if (!equal(current, before) && !equal(current, after))
      throw new Error(`Recovery conflict at ${entry.path}`);
    restore.push({ entry, before, after, current });
  }
  // Check all target conflicts before restoring any target.
  for (const { entry, before, after, current } of restore.reverse()) {
    if (!equal(current, before)) await replaceFile(root, entry, after, before, journal, directory);
  }
  for (const created of [...journal.directories].reverse()) {
    const info = await inspectPath(root, created.path);
    if (!info || String(info.dev) !== created.dev || String(info.ino) !== created.ino) continue;
    await rmdir(join(root, created.path)).catch((error) => {
      if (!['ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
    });
  }
  journal.phase = 'recovered';
  await saveJournal(directory, journal);
  await cleanState(directory, journal, recovery);
}

export async function applyProjectEdits(
  root,
  edits,
  { stateDirectory, check = false, onStep } = {},
) {
  const location = await paths(root, stateDirectory);
  root = location.root;
  const { directory, state } = location;
  if (!Array.isArray(edits) || edits.length > 1024) throw new Error('Invalid setup edit list.');
  const names = new Set();
  let size = 0;
  const planned = [];
  for (const edit of edits) {
    const path = safePath(edit?.path).toLowerCase();
    if (names.has(path)) throw new Error(`Duplicate setup path: ${edit.path}`);
    names.add(path);
  }
  for (const path of names) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++)
      if (names.has(parts.slice(0, i).join('/'))) throw new Error('Overlapping setup paths.');
  }
  for (const edit of edits) {
    const path = safePath(edit.path);
    const before = bytes(edit.before);
    const after = bytes(edit.after);
    size += (before?.length ?? 0) + (after?.length ?? 0);
    if (size > 32 * maxFile) throw new Error('Setup transaction exceeds size limit.');
    if (!equal(await readSafe(root, path), before))
      throw new Error(`Project file changed: ${path}`);
    const info = await inspectPath(root, path);
    if (!equal(before, after))
      planned.push({ path, before, after, mode: info ? Number(info.mode & 0o777n) : undefined });
  }
  planned.sort(
    (a, b) => Number(a.path === '.kiln/workspace.json') - Number(b.path === '.kiln/workspace.json'),
  );
  if (await maybeStat(directory))
    throw new Error(
      'Project setup is locked; finish the active setup or recover the interrupted update.',
    );
  if (check) return { status: 'planned', paths: planned.map((entry) => entry.path) };
  if (!planned.length) return { status: 'applied', paths: [] };
  await mkdir(state, { recursive: true, mode: 0o700 });
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Project setup is locked.');
    throw error;
  }
  active.add(directory);
  const { rootInfo } = location;
  const journal = {
    version: 1,
    root,
    rootDev: String(rootInfo.dev),
    rootIno: String(rootInfo.ino),
    pid: process.pid,
    id: randomUUID(),
    phase: 'preparing',
    directories: [],
    entries: [],
  };
  try {
    await assertRoot(root, journal);
    for (const [index, entry] of planned.entries()) {
      journal.entries.push({
        index,
        path: entry.path,
        mode: entry.mode,
        before: entry.before === undefined ? null : digest(entry.before),
        after: entry.after === undefined ? null : digest(entry.after),
        started: false,
      });
      for (const side of ['before', 'after'])
        if (entry[side] !== undefined)
          await durableWrite(join(directory, `${index}.${side}`), entry[side]);
    }
    journal.phase = 'prepared';
    await saveJournal(directory, journal);
    await onStep?.({ phase: 'prepared' });
    for (const [index, entry] of planned.entries()) {
      if (!equal(await readSafe(root, entry.path), entry.before))
        throw new Error(`Project file changed: ${entry.path}`);
      journal.entries[index].started = true;
      await saveJournal(directory, journal);
      await replaceFile(
        root,
        journal.entries[index],
        entry.before,
        entry.after,
        journal,
        directory,
      );
      await onStep?.({ phase: 'written', path: entry.path });
    }
    journal.phase = 'committed';
    await saveJournal(directory, journal);
    await cleanState(directory, journal);
    return { status: 'applied', paths: planned.map((entry) => entry.path) };
  } catch {
    if (journal.phase === 'committed')
      throw new Error('Setup completed but private recovery cleanup is required.');
    try {
      await rollback(root, directory, journal);
    } catch {
      throw new Error(
        'Setup stopped; recovery required. Existing user edits and private recovery data were retained.',
      );
    }
    throw new Error('Setup stopped; previous files were restored.');
  } finally {
    active.delete(directory);
  }
}

function validateJournal(journal, root) {
  const identity = (value) => typeof value === 'string' && /^[0-9]{1,40}$/.test(value);
  if (
    journal?.version !== 1 ||
    journal.root !== root ||
    !Number.isSafeInteger(journal.pid) ||
    journal.pid < 1 ||
    !identity(journal.rootDev) ||
    !identity(journal.rootIno) ||
    !/^[a-f0-9-]{36}$/.test(journal.id) ||
    !['prepared', 'committed', 'recovered'].includes(journal.phase) ||
    !Array.isArray(journal.entries) ||
    journal.entries.length > 1024 ||
    !Array.isArray(journal.directories) ||
    journal.directories.length > 8192
  )
    throw new Error('Invalid recovery journal.');
  const names = new Set();
  for (const [index, entry] of journal.entries.entries()) {
    safePath(entry.path);
    if (
      entry.index !== index ||
      names.has(entry.path.toLowerCase()) ||
      typeof entry.started !== 'boolean' ||
      (entry.mode !== undefined &&
        (!Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777)) ||
      ![entry.before, entry.after].every(
        (value) => value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)),
      )
    )
      throw new Error('Invalid recovery journal.');
    names.add(entry.path.toLowerCase());
  }
  for (const dir of journal.directories) {
    safePath(dir.path);
    if (
      !identity(dir.dev) ||
      !identity(dir.ino) ||
      !journal.entries.some((entry) => entry.path.startsWith(`${dir.path}/`))
    )
      throw new Error('Invalid recovery journal.');
  }
}

export async function recoverProjectEdits(root, { stateDirectory } = {}) {
  const location = await paths(root, stateDirectory);
  const { directory } = location;
  root = location.root;
  if (active.has(directory)) throw new Error('Project setup is still active.');
  const info = await maybeStat(directory);
  if (!info) return { status: 'unchanged' };
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid recovery storage.');
  let journal;
  try {
    journal = JSON.parse((await readSafe(directory, 'journal.json')).toString('utf8'));
  } catch {
    throw new Error(
      'Incomplete recovery journal; manual inspection is required. No project files were changed.',
    );
  }
  validateJournal(journal, root);
  await assertRoot(root, journal);
  if (journal.pid !== process.pid) {
    try {
      process.kill(journal.pid, 0);
      throw new Error('Project setup process is still active.');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  const recoveryLock = join(directory, 'recovery.lock');
  try {
    await durableWrite(recoveryLock, String(process.pid));
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error('Project recovery is already active or requires manual inspection.');
    throw error;
  }
  active.add(directory);
  try {
    if (journal.phase === 'committed' || journal.phase === 'recovered')
      await cleanState(directory, journal, true);
    else await rollback(root, directory, journal, true);
    return { status: 'recovered' };
  } finally {
    active.delete(directory);
    await unlink(recoveryLock).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
