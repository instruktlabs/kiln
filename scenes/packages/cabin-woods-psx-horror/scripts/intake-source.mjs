import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAX_FILE = 1024 * 1024, MAX_TOTAL = 16 * 1024 * 1024, MAX_FILES = 512;
async function noSymlink(target) {
  for (let cursor = target;; cursor = path.dirname(cursor)) {
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw Error('Symlink source/destination rejected: ' + cursor); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(cursor) === cursor) break;
  }
}
/** Local explicit intake: bounded game files, portable tests and only flat JSON fixtures; no wholesale copy. */
export async function intakeSource({ source, root = fileURLToPath(new URL('../', import.meta.url)) } = {}) {
  if (!source) throw Error('Pass an explicit reviewed scene source directory');
  source = path.resolve(source); root = path.resolve(root); await noSymlink(source); await noSymlink(root);
  source = await fs.realpath(source); root = await fs.realpath(root);
  if (source === root || source.startsWith(root + path.sep) || root.startsWith(source + path.sep)) throw Error('Source and destination must be separate roots');
  const files = new Map(); let total = 0, inspected = 0;
  async function read(relative) {
    const target = path.join(source, relative); await noSymlink(target);
    const resolved = await fs.realpath(target); if (!resolved.startsWith(source + path.sep)) throw Error('Unsafe source escape');
    const stat = await fs.stat(resolved); if (!stat.isFile() || stat.size > MAX_FILE || total + stat.size > MAX_TOTAL) throw Error('Source byte budget exceeded');
    const bytes = await fs.readFile(resolved); if (bytes.length !== stat.size) throw Error('Source changed during admission'); total += bytes.length; return bytes;
  }
  async function list(relative, optional = false) {
    const directory = path.join(source, relative); await noSymlink(directory);
    let handle; try { handle = await fs.opendir(directory); } catch (error) { if (optional && error.code === 'ENOENT') return []; throw error; }
    const entries = [];
    for await (const entry of handle) { if (++inspected > MAX_FILES) throw Error('Source file count budget exceeded'); entries.push(entry); }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }
  files.set('game.html', await read('game.html'));
  for (const entry of await list('src/game')) {
    if (entry.isSymbolicLink()) throw Error('Symlink game source rejected');
    if (!entry.isFile() || !/^[A-Za-z0-9_.-]+\.(?:jsx|mjs|css)$/.test(entry.name) || entry.name.startsWith('.')) throw Error('Unsupported/unsafe game source member');
    files.set('src/game/' + entry.name, await read('src/game/' + entry.name));
  }
  for (const entry of await list('tests', true)) {
    if (entry.isSymbolicLink()) throw Error('Symlink test source rejected');
    if (entry.isDirectory() && entry.name === 'fixtures') continue;
    if (!entry.isFile() || !/^[A-Za-z0-9_.-]+\.test\.mjs$/.test(entry.name) || entry.name.startsWith('.')) throw Error('Unsupported/unsafe test source member');
    const bytes = await read('tests/' + entry.name), text = bytes.toString('utf8');
    const relativeImports = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map(m => m[1]).filter(p => p.startsWith('.'));
    if (relativeImports.some(p => !/^\.\.\/(?:src\/game\/[A-Za-z0-9_.-]+\.(?:mjs|jsx)|scripts\/[A-Za-z0-9_.-]+\.mjs)$/.test(p))) continue;
    files.set('tests/' + entry.name, bytes);
  }
  for (const entry of await list('tests/fixtures', true)) {
    if (entry.isSymbolicLink()) throw Error('Symlink fixture rejected');
    if (!entry.isFile() || !/^[A-Za-z0-9_-]+\.json$/.test(entry.name)) throw Error('Unsupported/unsafe fixture member');
    const bytes = await read('tests/fixtures/' + entry.name); JSON.parse(bytes.toString('utf8')); files.set('tests/fixtures/' + entry.name, bytes);
  }
  for (const relative of files.keys()) await noSymlink(path.join(root, relative));
  // No destination mutation until all source and destination admission succeeds.
  for (const [relative, bytes] of files) { const target = path.join(root, relative); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes); }
  return { sourceIntake: 'complete', files: files.size, bytes: total, root };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await intakeSource({ source: process.argv[2] })));
