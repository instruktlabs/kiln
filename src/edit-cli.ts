import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { programRefPattern } from './program-store';
import { localProgramStore } from './program-store-node';
import { createKilnProgramToolRegistry } from './tools/registry';
import { FileWorkspace, localWorkspaceRoot } from './workspace-node';
import { FileLiveReview } from './live-review-node';
import { cliWorkspaceSelection, readMaterialDependencies } from './workspace-cli';

export const EDIT_USAGE = `
SOURCE EDITS
  kiln edit <programRef> --edits <edits.json> [--json]
       [--project <id> | --no-project] [--project-revision <revision>] [--materials <json>]

The JSON file contains an array of 1–20 { oldString, newString, replaceAll? }
replacements, applied in order by the shared kiln_edit tool. Anchors must match
exactly and uniquely unless replaceAll is true. A failed batch changes nothing.
The file must be valid UTF-8 JSON, no larger than 1 MiB.

Returns JSON with a new immutable programRef, applied counts and a bounded diff;
--json is accepted for symmetry and changes nothing. The original revision is
retained. This command edits source without evaluating or rendering it. Review
the new revision with kiln render before saving/delivery.
Use kiln source <programRef> --out <new-file.js> to export exact revised source.
Import a file first with kiln source <file.js>. Use the same workspace/store.
Exit codes: 0 success/help; 1 edit/input failure; 2 command usage.
`;

async function readEdits(path: string): Promise<unknown> {
  const file = await open(resolve(path), 'r');
  try {
    const limit = 1024 * 1024;
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error('--edits requires a regular JSON file no larger than 1 MiB.');
    const bytes = Buffer.alloc(limit + 1);
    let total = 0;
    while (total < bytes.length) {
      const read = await file.read(bytes, total, bytes.length - total, null);
      if (read.bytesRead === 0) break;
      total += read.bytesRead;
    }
    if (total > limit) throw new Error('--edits JSON exceeds 1 MiB.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, total)));
  } finally {
    await file.close();
  }
}

export async function editMain(argv: readonly string[]): Promise<number> {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0]!)) {
    console.log(EDIT_USAGE);
    return 0;
  }
  const programRef = argv[0];
  const flags: Record<string, string> = {};
  let valid = true;
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index]!;
    // Valueless switches. Edit output is always JSON, so --json only confirms it.
    if ((flag === '--no-project' || flag === '--json') && !Object.hasOwn(flags, flag)) {
      flags[flag] = 'true';
      continue;
    }
    const value = argv[++index];
    if (
      !['--edits', '--project', '--project-revision', '--materials'].includes(flag) ||
      Object.hasOwn(flags, flag) ||
      !value ||
      value.startsWith('--')
    ) {
      valid = false;
      break;
    }
    flags[flag] = value;
  }
  const path = flags['--edits'];
  if (!valid || !programRef || !programRefPattern.test(programRef) || !path) {
    console.error(EDIT_USAGE);
    return 2;
  }
  try {
    const selection = cliWorkspaceSelection(
      flags['--project'],
      flags['--project-revision'],
      flags['--no-project'] === 'true',
    );
    const materialDependencies = flags['--materials']
      ? await readMaterialDependencies(flags['--materials'])
      : undefined;
    const edits = await readEdits(path);
    // Patch-only use needs a store, not a renderer, evaluator or model provider.
    const workspaceRoot = localWorkspaceRoot();
    const workspace = new FileWorkspace(workspaceRoot, process.env.KILN_PROJECT);
    const liveReview =
      process.env.KILN_LIVE_REVIEW === 'off'
        ? undefined
        : new FileLiveReview(workspaceRoot, { transport: 'cli' });
    const tool = createKilnProgramToolRegistry({
      programStore: localProgramStore(),
      workspace,
      liveReview,
    }).find((definition) => definition.name === 'kiln_edit')!;
    const input = tool.inputSchema.parse({
      programRef,
      edits,
      render: false,
      ...selection,
      ...(materialDependencies ? { materialDependencies } : {}),
    });
    let output: { ok: boolean };
    try {
      output = (await tool.run(input)) as { ok: boolean };
    } finally {
      await liveReview?.flush();
    }
    console.log(JSON.stringify(output));
    return output.ok ? 0 : 1;
  } catch (error) {
    console.log(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return 1;
  }
}
