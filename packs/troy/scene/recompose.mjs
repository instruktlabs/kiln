// Recomposes s50's battle scene from the material-pass revisions. The saved scene source wraps
// each asset as `const ASSET_<key> = (() => { <source> return {...}; })();` (scene/compose.mjs
// in s50's workspace) and then carries the scene helpers and the layout. Each named block is
// replaced by the named revision's source.kiln.js; everything from `const ASSETS = {` on, the
// helpers and the layout, is kept byte for byte, which the output asserts.
//
// usage: node recompose.mjs <workspace> <saved scene source> <out file> '<json: key -> asset/revisions/rev>'
import fs from 'node:fs';
import path from 'node:path';

const [ws, scenePath, outPath, revJson] = process.argv.slice(2);
const REV = JSON.parse(revJson);
const src = fs.readFileSync(scenePath, 'utf8');
const nl = src.includes('\r\n') ? '\r\n' : '\n';
const tailAt = src.indexOf('const ASSETS = {');
if (tailAt < 0) throw new Error('no ASSETS table in the scene source');
let head = src.slice(0, tailAt);
const tail = src.slice(tailAt);
const replaced = {};
for (const [key, rel] of Object.entries(REV)) {
  const open = `const ASSET_${key} = (() => {${nl}`;
  const close = `${nl}return { build, animate: typeof animate === 'function' ? animate : null };${nl}})();${nl}${nl}`;
  const start = head.indexOf(open);
  if (start < 0) throw new Error(`no block for ${key}`);
  const end = head.indexOf(close, start);
  if (end < 0) throw new Error(`no end of block for ${key}`);
  const file = path.join(ws, 'assets', 'kiln', rel, 'source.kiln.js');
  const source = fs.readFileSync(file, 'utf8');
  const was = end - (start + open.length);
  head = head.slice(0, start + open.length) + source + head.slice(end);
  replaced[key] = { from: rel, was, now: source.length };
}
const out = head + tail;
fs.writeFileSync(outPath, out);
console.log(JSON.stringify({ bytes: out.length, before: src.length, tailBytes: tail.length, tailIdentical: out.endsWith(tail), replaced }, null, 1));
