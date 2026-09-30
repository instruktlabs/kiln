/** Workspace HTTP adapter. Storage and validation are shared with CLI/MCP. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { FileWorkspace } from './workspace-node';
import type { FileLiveReview } from './live-review-node';
import { projectDraftSchema, projectPatchSchema, projectRevisionIdSchema } from './projects';
import { materialLibraryPortableSpec } from './material-library';
import { createKilnReviewDef } from './tools/review';
import { createKilnMaterialDef } from './tools/materials';
import type { AssetLibrary } from './assets';
import { exportWorkspaceProjectBundle } from './project-bundle-node';
import type { LiveOperation } from './live-review';

export interface WorkspaceHttpServices {
  workspace?: FileWorkspace;
  liveReview?: FileLiveReview;
  assetLibrary?: AssetLibrary;
  reviewSources?: Record<string, { label: string; review: FileLiveReview }>;
}
export class WorkspaceHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
async function readJson(req: IncomingMessage, origin: string) {
  if (req.headers.origin !== origin) throw new WorkspaceHttpError(403, 'Same-origin writes only');
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
    throw new WorkspaceHttpError(415, 'JSON body required');
  const limit = 1024 * 1024;
  if (Number(req.headers['content-length']) > limit)
    throw new WorkspaceHttpError(413, 'Request body exceeds 1 MiB');
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        reject(new WorkspaceHttpError(413, 'Request body exceeds 1 MiB'));
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
    req.on('aborted', () => reject(new WorkspaceHttpError(400, 'Request aborted')));
  });
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new WorkspaceHttpError(400, 'Invalid JSON body');
  }
}
const updateSchema = z.strictObject({
  expectedRevision: projectRevisionIdSchema,
  patch: projectPatchSchema,
});
const pinSchema = z.strictObject({ pinned: z.boolean() });
const filePattern = /^(asset\.glb|source\.kiln\.js|evaluation\.json|capture-\d{1,2}\.png)$/;
export async function serveWorkspaceRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  services: WorkspaceHttpServices,
): Promise<boolean> {
  const { workspace } = services;
  const sourceId = url.searchParams.get('source') ?? '';
  const liveReview = sourceId
    ? Object.hasOwn(services.reviewSources ?? {}, sourceId)
      ? services.reviewSources?.[sourceId]?.review
      : undefined
    : services.liveReview;
  const qualify = (operation: LiveOperation): LiveOperation =>
    sourceId
      ? {
          ...operation,
          ...(operation.artifact
            ? {
                artifact: {
                  ...operation.artifact,
                  url: `${operation.artifact.url}?source=${encodeURIComponent(sourceId)}`,
                },
              }
            : {}),
          captures: operation.captures.map((file) => ({
            ...file,
            url: `${file.url}?source=${encodeURIComponent(sourceId)}`,
          })),
        }
      : operation;
  const method = req.method;
  const read = method === 'GET' || method === 'HEAD';
  const json = (value: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(method === 'HEAD' ? undefined : JSON.stringify(value));
    return true;
  };
  const bytes = (value: Uint8Array, mime: string) => {
    res.setHeader('Content-Type', mime);
    res.end(method === 'HEAD' ? undefined : value);
    return true;
  };
  const parts = url.pathname.split('/').slice(1).map(decodeURIComponent);
  if (parts[0] !== 'api') return false;
  if (parts[1] === 'live-sources' && parts.length === 2 && read)
    return json({
      sources: [
        { id: '', label: 'Current workspace' },
        ...Object.entries(services.reviewSources ?? {}).map(([id, source]) => ({
          id,
          label: source.label,
        })),
      ],
    });
  if (parts[1] === 'live' && sourceId && !liveReview)
    throw new WorkspaceHttpError(404, 'Unknown review source');
  if (parts[1] === 'material-presets' && parts.length === 2 && workspace && read)
    return json(await createKilnMaterialDef(workspace.materials).run({ action: 'presets' }));
  if (
    parts[1] === 'materials' &&
    parts[2] === 'preset' &&
    parts.length === 3 &&
    workspace &&
    method === 'POST'
  ) {
    const raw = await readJson(req, url.origin);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new WorkspaceHttpError(400, 'Expected preset options');
    return json(
      await createKilnMaterialDef(workspace.materials).run({ ...raw, action: 'create-preset' }),
      201,
    );
  }
  if (parts[1] === 'projects' && workspace) {
    if (parts.length === 4 && parts[3] === 'bundle' && read && services.assetLibrary) {
      const profile = url.searchParams.get('profile') ?? 'editable';
      if (profile !== 'editable' && profile !== 'runtime')
        throw new WorkspaceHttpError(400, 'Unknown project profile');
      const data = await exportWorkspaceProjectBundle(workspace, services.assetLibrary, parts[2]!, {
        revisionId: url.searchParams.get('revision') ?? undefined,
        profile,
      });
      res.setHeader('Content-Disposition', `attachment; filename="${parts[2]}-${profile}.zip"`);
      return bytes(data, 'application/zip');
    }
    if (parts.length === 2 && read) return json({ projects: await workspace.projects.list() });
    if (parts.length === 2 && method === 'POST')
      return json(
        await workspace.projects.create(projectDraftSchema.parse(await readJson(req, url.origin))),
        201,
      );
    if (parts.length === 3 && read)
      return json(
        await workspace.projects.read(parts[2]!, url.searchParams.get('revision') ?? undefined),
      );
    if (parts.length === 3 && method === 'PATCH') {
      const input = updateSchema.parse(await readJson(req, url.origin));
      return json(await workspace.projects.update(parts[2]!, input.expectedRevision, input.patch));
    }
  }
  if (parts[1] === 'materials' && workspace && read) {
    if (parts.length === 2) return json({ materials: await workspace.materials.list() });
    if (parts.length === 4 || parts.length === 5) {
      const record = await workspace.materials.read(parts[2]!, parts[3]!);
      if (parts.length === 4)
        return json({
          manifest: record.manifest,
          portableSpec: materialLibraryPortableSpec(record.manifest),
        });
      const file = record.files[parts[4]!];
      if (!file) throw new WorkspaceHttpError(404, 'Unknown material file');
      return bytes(file, 'image/png');
    }
  }
  if (parts[1] === 'live' && liveReview) {
    if (parts.length === 2 && read) {
      const snapshot = await liveReview.snapshot({
        cursor: url.searchParams.get('cursor') ?? undefined,
        projectId: url.searchParams.get('project') ?? undefined,
      });
      return json({ ...snapshot, operations: snapshot.operations.map(qualify) });
    }
    if (parts.length === 3 && read) return json(qualify(await liveReview.get(parts[2]!)));
    if (parts.length === 4 && parts[3] === 'pin' && method === 'POST') {
      const { pinned } = pinSchema.parse(await readJson(req, url.origin));
      await liveReview.pin(parts[2]!, pinned);
      return json(qualify(await liveReview.get(parts[2]!)));
    }
    if (parts.length === 4 && parts[3] === 'save' && method === 'POST' && services.assetLibrary) {
      const raw = await readJson(req, url.origin);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new WorkspaceHttpError(400, 'Expected save options');
      return json(
        await createKilnReviewDef({
          reviewStore: liveReview,
          assetLibrary: services.assetLibrary,
        }).run({ ...raw, action: 'save', operationId: parts[2] }),
        201,
      );
    }
    if (parts.length === 4 && read) {
      const file = parts[3]!;
      if (!filePattern.test(file)) throw new WorkspaceHttpError(404, 'Unknown live file');
      return bytes(
        await liveReview.readFile(parts[2]!, file),
        file.endsWith('.glb')
          ? 'model/gltf-binary'
          : file.endsWith('.png')
            ? 'image/png'
            : file.endsWith('.js')
              ? 'text/javascript'
              : 'application/json',
      );
    }
  }
  return false;
}
