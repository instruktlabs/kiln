import { DurableObject } from 'cloudflare:workers';
import { ArtifactStore } from './artifact-store';
import { boundedRequest, HttpFailure, privateResponse, readBounded, serviceFailure } from './http';
import { decodeProgram, HostedProgramStore } from './programs';
import { MAX_PROGRAM_BYTES } from '../../src/program-store';
import { AssetIndex } from './asset-index';
import { AssetDownloadTickets } from './asset-downloads';
import { parseDownloadPath } from './download-path';

export interface TenantStorageEnv {
  ARTIFACTS: R2Bucket;
  STORAGE_MAX_BYTES: string;
  STORAGE_MAX_OBJECTS: string;
  STORAGE_MAX_GROUPS: string;
}

export class KilnTenant extends DurableObject<TenantStorageEnv> {
  private readonly artifacts: ArtifactStore;
  private readonly programs: HostedProgramStore;
  private readonly assets: AssetIndex;
  private readonly downloads: AssetDownloadTickets;

  constructor(ctx: DurableObjectState, env: TenantStorageEnv) {
    super(ctx, env);
    this.artifacts = new ArtifactStore(ctx, env.ARTIFACTS, {
      maxBytes: Number(env.STORAGE_MAX_BYTES),
      maxObjects: Number(env.STORAGE_MAX_OBJECTS),
      maxGroups: Number(env.STORAGE_MAX_GROUPS),
    });
    this.programs = new HostedProgramStore(this.artifacts);
    this.assets = new AssetIndex(this.artifacts);
    this.downloads = new AssetDownloadTickets(ctx.storage, this.artifacts, this.assets);
  }

  async alarm(): Promise<void> {
    this.downloads.sweep();
    await this.artifacts.sweep();
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.origin !== 'https://tenant.internal' || url.search)
        throw new HttpFailure(400, 'Invalid internal request');
      if (url.pathname === '/internal/downloads' && request.method === 'POST') {
        if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
          throw new HttpFailure(415, 'Expected download selection');
        const bounded = await boundedRequest(request, 1024);
        let value: unknown;
        try {
          value = await bounded.json();
        } catch {
          throw new HttpFailure(400, 'Invalid download selection');
        }
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          Object.keys(value).some((key) => !['collection', 'assetId', 'revisionId'].includes(key))
        )
          throw new HttpFailure(400, 'Invalid download selection');
        const input = value as Record<string, unknown>;
        return privateResponse(
          Response.json(
            await this.downloads.issue(input.collection, input.assetId, input.revisionId),
            { status: 201 },
          ),
        );
      }
      if (url.pathname.startsWith('/internal/downloads/')) {
        const selected = parseDownloadPath(url.pathname.slice('/internal'.length));
        if (!selected) throw new HttpFailure(404, 'Download link unavailable; request a new link');
        if (!['GET', 'HEAD'].includes(request.method))
          return new Response('Method not allowed', { status: 405 });
        return await this.downloads.download(
          selected.token,
          selected.filename,
          request.method === 'HEAD',
        );
      }
      if (
        ['/internal/assets/commit', '/internal/assets/list'].includes(url.pathname) &&
        request.method === 'POST'
      ) {
        const bounded = await boundedRequest(request, 2048);
        let input: unknown;
        try {
          input = await bounded.json();
        } catch {
          throw new HttpFailure(400, 'Invalid saved asset');
        }
        if (url.pathname.endsWith('/list'))
          return privateResponse(Response.json(this.assets.list(input)));
        const result = this.assets.commit(input);
        return privateResponse(
          Response.json(result.record, { status: result.created ? 201 : 200 }),
        );
      }
      const asset = url.pathname.match(/^\/internal\/assets\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (asset && request.method === 'GET')
        return privateResponse(Response.json(this.assets.read(asset[1], asset[2], asset[3])));
      if (url.pathname === '/internal/programs' && request.method === 'GET') {
        return privateResponse(
          Response.json({ ...(await this.programs.stats()), retention: this.programs.retention }),
        );
      }
      if (url.pathname === '/internal/programs' && request.method === 'POST') {
        if (request.headers.get('content-type')?.split(';')[0] !== 'application/javascript') {
          throw new HttpFailure(415, 'Program source requires application/javascript');
        }
        const code = decodeProgram(await readBounded(request.body, MAX_PROGRAM_BYTES));
        const programRef = await this.programs.put(code);
        return privateResponse(
          Response.json(
            {
              programRef,
              shortRef: await this.programs.shortRef(programRef),
              artifactId: this.programs.artifact(programRef).id,
            },
            { status: 201 },
          ),
        );
      }
      if (url.pathname.startsWith('/internal/programs/') && request.method === 'GET') {
        let ref: string;
        try {
          ref = decodeURIComponent(url.pathname.slice('/internal/programs/'.length));
        } catch {
          throw new HttpFailure(400, 'Invalid program reference');
        }
        return privateResponse(
          new Response(await this.programs.get(ref), {
            headers: {
              'content-type': 'text/plain; charset=utf-8',
              'content-disposition': 'attachment; filename="source.kiln.js"',
            },
          }),
        );
      }
      const download = url.pathname.match(/^\/mcp\/artifacts\/([a-f0-9]{32})$/);
      if (download) {
        if (!['GET', 'HEAD'].includes(request.method))
          return new Response('Method not allowed', { status: 405 });
        return await this.artifacts.download(download[1]!, request.method === 'HEAD');
      }
      if (url.pathname === '/internal/artifacts' && request.method === 'POST') {
        return privateResponse(
          Response.json(await this.artifacts.upload(request), { status: 201 }),
        );
      }
      if (url.pathname === '/internal/artifacts/discard' && request.method === 'POST') {
        const bounded = await boundedRequest(request, 1024);
        let ids: unknown;
        try {
          ids = await bounded.json();
        } catch {
          throw new HttpFailure(400, 'Invalid staging inventory');
        }
        await this.artifacts.discard(ids);
        return privateResponse(Response.json({ discarded: true }));
      }
      if (url.pathname === '/internal/groups' && request.method === 'POST') {
        const bounded = await boundedRequest(request, 131_072);
        let body: unknown;
        try {
          body = await bounded.json();
        } catch {
          throw new HttpFailure(400, 'Invalid saved revision');
        }
        const result = this.artifacts.save(body);
        return privateResponse(
          Response.json(result.record, { status: result.created ? 201 : 200 }),
        );
      }
      const group = url.pathname.match(/^\/internal\/groups\/([a-f0-9]{32})$/);
      if (group && request.method === 'GET')
        return privateResponse(Response.json(this.artifacts.group(group[1]!)));
      if (group && request.method === 'DELETE') {
        await this.artifacts.deleteGroup(group[1]!);
        return privateResponse(Response.json({ deleted: true }));
      }
      if (url.pathname === '/internal/usage' && request.method === 'GET')
        return privateResponse(Response.json(this.artifacts.usage()));
      if (url.pathname === '/internal/maintenance' && request.method === 'POST') {
        this.downloads.sweep();
        return privateResponse(Response.json(await this.artifacts.sweep()));
      }
      if (url.pathname === '/mcp')
        return new Response('Native engine is not configured or qualified', { status: 503 });
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return privateResponse(serviceFailure(error));
    }
  }
}
