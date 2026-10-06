#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Typecheck an installed consumer without resolving optional peers from this repo. */
export async function smokeSdkTypes(runtime, { includeAgentPeers = false } = {}) {
  const pkg = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'));
  const entries = Object.keys(pkg.exports).filter(
    (name) => includeAgentPeers || !['./agent', './composer/agent'].includes(name),
  );
  const stage = await mkdtemp(join(runtime, '.sdk-consumer-'));
  try {
    const source = join(stage, 'consumer.mts');
    await writeFile(
      source,
      entries
        .map((name, index) => {
          const specifier = name === '.' ? pkg.name : `${pkg.name}/${name.slice(2)}`;
          return `import * as E${index} from ${JSON.stringify(specifier)}; void E${index};`;
        })
        .join('\n'),
    );
    execFileSync(
      'node',
      [
        fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--module',
        'NodeNext',
        '--target',
        'ES2022',
        '--types',
        'node',
        '--typeRoots',
        fileURLToPath(new URL('../node_modules/@types', import.meta.url)),
        source,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    return { package: pkg.name, entries: entries.length, status: 'passed' };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [runtime, option, ...extra] = process.argv.slice(2);
    if (!runtime || (option && option !== '--with-agent-peers') || extra.length)
      throw new Error('Pass the installed package directory and optional --with-agent-peers.');
    console.log(
      JSON.stringify(
        await smokeSdkTypes(resolve(runtime), {
          includeAgentPeers: option === '--with-agent-peers',
        }),
      ),
    );
  } catch (error) {
    console.error(error.stdout || error.message);
    process.exitCode = 1;
  }
}
