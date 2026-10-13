import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { intakeSource } from '../scripts/intake-source.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'cabin-source-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'target'), source = join(dir, 'source'); await mkdir(root); await mkdir(source);
  const put = async (name, data) => { const path = join(source, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, data); };
  await put('game.html', '<title>fixture</title>'); await put('src/game/main.jsx', 'export const value=1;');
  await put('tests/game.test.mjs', "import {value} from '../src/game/main.jsx';");
  await put('tests/engine.test.mjs', "import '../src/engine-private.mjs';");
  await put('tests/fixtures/contact.json', '{"sample":1}'); return { dir, root, source, put };
}
test('explicit source intake copies bounded game source and portable tests/JSON fixtures only', async t => {
  const f = await fixture(t); const result = await intakeSource(f); assert.equal(result.files, 4);
  assert.equal(await readFile(join(f.root, 'src/game/main.jsx'), 'utf8'), 'export const value=1;');
  assert.equal(await readFile(join(f.root, 'tests/fixtures/contact.json'), 'utf8'), '{"sample":1}');
  await assert.rejects(access(join(f.root, 'tests/engine.test.mjs')));
});
test('symlinked fixture directory cannot escape explicit source root or create partial output', async t => {
  const f = await fixture(t); await rm(join(f.source, 'tests/fixtures'), { recursive: true });
  const outside = join(f.dir, 'outside'); await mkdir(outside); await writeFile(join(outside, 'secret.json'), '{}'); await symlink(outside, join(f.source, 'tests/fixtures'), 'junction');
  await assert.rejects(intakeSource(f), /symlink/i); await assert.rejects(access(join(f.root, 'game.html')));
});
test('credential-like or non-JSON fixture files reject without wholesale directory copying', async t => {
  const f = await fixture(t); await f.put('tests/fixtures/.env', 'private');
  await assert.rejects(intakeSource(f), /unsupported|unsafe/i); await assert.rejects(access(join(f.root, 'game.html')));
});
test('source byte admission and symlink destination reject before writes', async t => {
  const f = await fixture(t); await f.put('src/game/oversized.mjs', Buffer.alloc(1024 * 1024 + 1));
  await assert.rejects(intakeSource(f), /budget/i); await assert.rejects(access(join(f.root, 'game.html')));
  await rm(join(f.source, 'src/game/oversized.mjs')); const outside = join(f.dir, 'outside'); await mkdir(outside); await symlink(outside, join(f.root, 'src'), 'junction');
  await assert.rejects(intakeSource(f), /symlink/i); await assert.rejects(access(join(outside, 'game/main.jsx')));
});
test('portable script tests are retained while source escapes are excluded', async t => {
  const f = await fixture(t); await f.put('tests/hydration.test.mjs', "import {hydrateRuntime} from '../scripts/hydrate-runtime.mjs';");
  await f.put('tests/outside.test.mjs', "const x=await import('../../engine-private.mjs');");
  await intakeSource(f); assert.match(await readFile(join(f.root, 'tests/hydration.test.mjs'), 'utf8'), /hydrateRuntime/); await assert.rejects(access(join(f.root, 'tests/outside.test.mjs')));
});
