import { FileLiveReview } from './live-review-node';
import { localWorkspaceRoot } from './workspace-node';
import { localAssetLibrary } from './assets-node';
import { createKilnReviewDef } from './tools/review';
import { readHostRequirementsFile } from './requirements-file';

export const REVIEW_USAGE = `
LIVE REVIEW
  kiln review list [--project <id>]
  kiln review get <operation-id>
  kiln review pin <operation-id> --pinned true|false
  kiln review save <operation-id> --expected <revision> --name <name>
       [--collection project] [--asset <id> --parent <revision>]
       [--requirements <host-binding.json>]

Save preserves the recorded source, GLB and capture without evaluating again.
Pinning retains evidence; it does not pause an agent. View opens the local dashboard.
`;
export async function reviewMain(argv: readonly string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(REVIEW_USAGE);
    return 0;
  }
  const action = argv[0];
  const allowed: Record<string, string[]> = {
    list: ['project'],
    get: [],
    pin: ['pinned'],
    save: ['expected', 'name', 'collection', 'asset', 'parent', 'requirements'],
  };
  if (!action || !allowed[action])
    throw new Error('Unknown review action. Run kiln review --help.');
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const value = argv[++index];
    if (
      !allowed[action]!.includes(key) ||
      !value ||
      value.startsWith('--') ||
      Object.hasOwn(flags, key)
    )
      throw new Error(`Invalid review option ${arg}`);
    flags[key] = value;
  }
  if (positional.length !== (action === 'list' ? 0 : 1))
    throw new Error('Expected one operation ID for get, pin or save');
  if (action === 'pin' && !['true', 'false'].includes(flags.pinned ?? ''))
    throw new Error('--pinned requires true or false');
  const input =
    action === 'list'
      ? { action, projectId: flags.project }
      : action === 'get'
        ? { action, operationId: positional[0] }
        : action === 'pin'
          ? { action, operationId: positional[0], pinned: flags.pinned === 'true' }
          : {
              action,
              operationId: positional[0],
              expectedRevision: Number(flags.expected),
              name: flags.name,
              collection: flags.collection,
              assetId: flags.asset,
              parentRevision: flags.parent,
            };
  const def = createKilnReviewDef({
    reviewStore: new FileLiveReview(localWorkspaceRoot()),
    assetLibrary: localAssetLibrary(),
    requirements: flags.requirements
      ? await readHostRequirementsFile(flags.requirements)
      : undefined,
  });
  console.log(JSON.stringify(await def.run(input), null, 2));
  return 0;
}
