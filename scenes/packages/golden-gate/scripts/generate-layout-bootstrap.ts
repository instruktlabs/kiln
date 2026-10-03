// From scenes/: bun packages/golden-gate/scripts/generate-layout-bootstrap.ts --write (or --check).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectLayoutBootstrap, stableLayoutJson } from '../src/layout-contract';
import type { SceneLayout } from '../src/data';

const root = fileURLToPath(new URL('..', import.meta.url)), source = readFileSync(resolve(root, 'data/layout.json'));
const record = { schema: 'golden-gate-bootstrap/1', source: 'data/layout.json', sourceSha256: createHash('sha256').update(source).digest('hex'),
  projection: projectLayoutBootstrap(JSON.parse(new TextDecoder().decode(source)) as SceneLayout) };
const output = JSON.stringify(JSON.parse(stableLayoutJson(record)), null, 2) + '\n', path = resolve(root, 'src/layout-bootstrap.json');
const flag = process.argv[2] ?? '--check';
if (flag === '--write') writeFileSync(path, output);
else if (flag !== '--check') throw new Error('Use --check or --write');
else if (readFileSync(path, 'utf8') !== output) throw new Error('Golden Gate bootstrap is stale; run generate-layout-bootstrap.ts --write and rebuild');
