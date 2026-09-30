import { expect, test } from 'bun:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { renderGLBInProcess } from '../render';
import { programReference } from '../program-store';

test('actual CLI generation enforces its call budget and delivers retained bytes without evaluating again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-cli-generation-'));
  const code =
    "const meta={name:'Box'};function build(){const r=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#777777'),{parent:r});return r;}";
  const rendered = await renderGLBInProcess(code);
  const programRef = await programReference(code);
  const artifact = {
    code,
    programRef,
    rendered: { ...rendered, glb: rendered.glb.toString('base64') },
    captureSelection: {},
    review: { ok: true },
  };
  try {
    await writeFile(join(directory, 'artifact.json'), JSON.stringify(artifact));
    await writeFile(
      join(directory, 'preload.ts'),
      `
import {mock} from 'bun:test';
import {readFileSync} from 'node:fs';
mock.module(${JSON.stringify(resolve(import.meta.dir, '../agent/providers.ts'))},()=>({resolveKilnAgentModel:()=>({}),makeKilnModel:async()=>({})}));
mock.module(${JSON.stringify(resolve(import.meta.dir, '../agent/run.ts'))},()=>({runKilnAgent:async(opts)=>{
  if(opts.generationCallBudget?.receipt().limit!==3)throw new Error('CLI call budget was lost');
  opts.evaluatorPort.render=async()=>{throw new Error('CLI evaluated reviewed source again');};
  const artifact=JSON.parse(readFileSync(${JSON.stringify(join(directory, 'artifact.json'))},'utf8'));
  artifact.rendered.glb=Buffer.from(artifact.rendered.glb,'base64');
  const partial=process.env.TEST_PARTIAL==='1';
  return {completion:partial?'partial':'finished',artifact,code:artifact.code,programRef:artifact.programRef,steps:3,toolCalls:['kiln_render','kiln_finish'],...(partial?{error:'budget exhausted',capped:true}:{})};
}}));`,
    );
    const run = (partial: boolean, out = 'box.glb', views?: string) =>
      Bun.spawnSync(
        [
          process.execPath,
          '--preload',
          join(directory, 'preload.ts'),
          resolve(import.meta.dir, '../cli.ts'),
          'generate',
          'a box',
          '--model',
          'test:offline',
          '--max-steps',
          '3',
          '--out',
          out,
          ...(views ? ['--views', views] : []),
          '--render',
          'cpu',
        ],
        {
          cwd: directory,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            TEST_PARTIAL: partial ? '1' : '0',
            KILN_RENDER: 'cpu',
            KILN_WORKSPACE: directory,
            KILN_PROGRAM_STORE: join(directory, 'programs'),
            KILN_BUILD_CACHE_DIR: join(directory, 'cache'),
          },
        },
      );
    const complete = run(false);
    expect(complete.stderr.toString()).toBe('');
    expect(complete.exitCode).toBe(0);
    expect(await readFile(join(directory, 'box.glb'))).toEqual(Buffer.from(rendered.glb));
    for (const name of ['extensionless', 'custom.bin']) {
      const custom = run(false, name);
      expect(custom.exitCode).toBe(0);
      expect(await readFile(join(directory, name))).toEqual(Buffer.from(rendered.glb));
      expect(await readFile(join(directory, `${name}.kiln.js`), 'utf8')).toBe(code);
    }
    await writeFile(join(directory, 'sheet.png'), 'completed view must survive');
    const partial = run(true, 'box.glb', 'sheet.png');
    expect(partial.exitCode).toBe(2);
    expect(partial.stderr.toString()).toContain('partial');
    expect(await readFile(join(directory, 'sheet.png'), 'utf8')).toBe(
      'completed view must survive',
    );
    expect((await readFile(join(directory, 'sheet.partial.png'))).subarray(0, 4)).toEqual(
      Buffer.from([137, 80, 78, 71]),
    );
    expect(await readFile(join(directory, 'box.partial.glb'))).toEqual(Buffer.from(rendered.glb));
    expect(await readFile(join(directory, 'box.glb'))).toEqual(Buffer.from(rendered.glb));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
