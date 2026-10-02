import { z } from 'zod';
import { workspaceSelectionSchema } from '../workspace';
import type { KilnToolContext, KilnToolDef } from './registry';
import type { LiveReviewPort } from '../live-review';

/** The LiveReviewPort callback contract is synchronous admission, not storage completion. */
export async function observeLiveReview<T>(
  observer: LiveReviewPort | undefined,
  tool: string,
  input: unknown,
  run: () => Promise<T>,
): Promise<T> {
  let authoring: Promise<T> | undefined;
  const invokeOnce = () => (authoring ??= Promise.resolve().then(run));
  try {
    // A healthy observer establishes its async context before admitting the callback.
    // Its own promise is never the authority for the authoring result or its lifetime.
    if (observer) void Promise.resolve(observer.observe(tool, input, invokeOnce)).catch(() => {});
  } catch {
    // Optional observation cannot prevent an invocation from starting.
  }
  return invokeOnce();
}

const observed = new Set([
  'kiln_render',
  'kiln_edit',
  'kiln_screenshot_animation',
  'kiln_view_interior',
  'kiln_inspect',
  'kiln_save',
]);
/** One binding and observation boundary for registry tools and direct CLI authoring. */
export async function observeWorkspaceOperation<T>(
  context: KilnToolContext,
  tool: string,
  input: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  let began = false;
  const execute = () => {
    began = true;
    const project = context.workspace?.current()?.project;
    return observeLiveReview(
      context.liveReview,
      tool,
      {
        ...input,
        ...(project ? { projectId: project.projectId, projectRevision: project.revisionId } : {}),
        runtimeIdentity: context.localExecution?.runtimeIdentity,
      },
      run,
    );
  };
  try {
    return await (context.workspace
      ? context.workspace.run(
          {
            ...(typeof input.projectId === 'string' || input.projectId === null
              ? { projectId: input.projectId }
              : {}),
            ...(typeof input.projectRevision === 'string'
              ? { projectRevision: input.projectRevision }
              : {}),
            ...(input.materialDependencies !== undefined
              ? {
                  materialDependencies: workspaceSelectionSchema.shape.materialDependencies.parse(
                    input.materialDependencies,
                  ),
                }
              : {}),
          },
          execute,
        )
      : execute());
  } catch (error) {
    if (began) throw error;
    // No resolved binding exists yet. Record the request without inventing a revision.
    return observeLiveReview(
      context.liveReview,
      tool,
      { ...input, runtimeIdentity: context.localExecution?.runtimeIdentity },
      async () => {
        throw error;
      },
    );
  }
}
/** Shared transport adaptation: one explicit project snapshot and one observation per invocation. */
export function withWorkspaceContext(def: KilnToolDef, context: KilnToolContext): KilnToolDef {
  if (!observed.has(def.name)) return def;
  const schema =
    context.workspace && def.inputSchema instanceof z.ZodObject
      ? def.inputSchema.safeExtend(workspaceSelectionSchema.shape)
      : def.inputSchema;
  return {
    ...def,
    inputSchema: schema,
    run: async (raw) => {
      const input = schema.parse(raw) as Record<string, unknown>;
      return observeWorkspaceOperation(context, def.name, input, async () => {
        const output = await def.run(input);
        // A project-bound result names the exact revision it used, so the agent can see
        // that the configured project applied (and which revision) without another call.
        const project = context.workspace?.current()?.project;
        return project && output && typeof output === 'object' && !Array.isArray(output)
          ? { ...output, project: { projectId: project.projectId, revisionId: project.revisionId } }
          : output;
      });
    },
  };
}
