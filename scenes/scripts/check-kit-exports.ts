import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript-6';

// Compile source symbols only: no scene, renderer, browser or build is executed.
const workspace = resolve(import.meta.dir, '..');
const spec = await readFile(resolve(workspace, 'SPEC.md'), 'utf8');
const start = spec.indexOf('## 5. Contract'), end = spec.indexOf('## 14.');
if (start < 0 || end <= start) throw new Error('Cannot locate normative SPEC sections 5–13');
const scope = spec.slice(start, end);
const expectedNames = [...new Set([...scope.matchAll(/export\s+(?:function|interface|type|class|const)\s+(\w+)/g)].map(match => match[1]!))].sort();
if (!expectedNames.length) throw new Error('No normative exports found');

const configPath = ts.findConfigFile(workspace, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error('Workspace TypeScript configuration is missing');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, workspace);
if (parsed.errors.length) throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
const entry = 'packages/scene-kit/src/index.ts';
const filename = resolve(workspace, entry);
const program = ts.createProgram([filename], { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker(), source = program.getSourceFile(filename);
const module = source && checker.getSymbolAtLocation(source);
if (!module) throw new Error('Cannot resolve the scene-kit root module');
const actualNames = checker.getExportsOfModule(module).map(symbol => symbol.getName()).sort();
const actual = new Set(actualNames), missing = expectedNames.filter(name => !actual.has(name));
const evidence = {
  check: 'scene-kit-normative-exports',
  command: 'bun scripts/check-kit-exports.ts',
  compiler: { package: 'typescript-6', version: ts.version },
  input: { path: 'SPEC.md', sha256: createHash('sha256').update(spec).digest('hex'), sections: '5–13' },
  entry,
  method: 'Extract explicit export declarations from SPEC sections 5–13, then resolve the root barrel through the TypeScript compiler export table, including re-exports and type-only exports.',
  limits: 'Name availability only; signatures, behavior, prose-only component names and acceptance tests have separate evidence.',
  expectedCount: expectedNames.length,
  actualCount: actualNames.length,
  missing,
  expectedNames,
  actualNames,
  pass: missing.length === 0,
};
const out = resolve(workspace, 'evidence/m1');
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'export-audit.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ check: evidence.check, compiler: evidence.compiler, expectedCount: evidence.expectedCount, actualCount: evidence.actualCount, missing, pass: evidence.pass }));
if (missing.length) process.exitCode = 1;
