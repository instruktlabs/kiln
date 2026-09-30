/** Host-only, read-only renderer reporting. Never starts a renderer or requests an image. */
import type { RenderMode } from './cli-render-mode';
import { readRenderServiceHealth } from './render-service-client';
import {
  localRenderServiceState,
  localRenderServiceUrl,
  namesLocalRenderService,
  renderServiceDir,
  renderServiceSourceFingerprint,
  explainRenderServiceState,
  type LocalRenderServiceState,
} from './render-service-host';
import { RENDER_SERVICE_DEPENDENCIES } from '../render-service/src/build-identity.mjs';

export interface RenderCapabilities {
  mode: RenderMode | 'host-injected';
  target: 'cpu' | 'local' | 'remote' | 'host-injected';
  configured: boolean;
  reprobeRequired?: boolean;
  required: boolean;
  status:
    | 'disabled'
    | 'available'
    | 'on-demand'
    | 'unavailable'
    | 'unknown'
    | 'authentication-required'
    | 'authentication-unverified';
  endpoint?: string;
  autoStart?: boolean;
  installation?: LocalRenderServiceState;
  dependencies?: Record<string, string>;
  rendererId?: string;
  authentication?: 'not-required' | 'missing' | 'configured-unverified';
  reason?: string;
  evidence: 'configuration-only' | 'health-only' | 'host-unspecified';
}

/** Capture selection/credentials once; sample health and dependency readiness on every call. */
export function createRenderCapabilitiesReader(
  mode: RenderMode,
  portUrl?: string,
  options: { autoSpawn?: boolean; serviceDir?: string; injectedStart?: boolean } = {},
): () => Promise<RenderCapabilities> {
  const configured = portUrl || process.env.KILN_RENDER_PORT_URL;
  // A URL naming the shared local socket is the local route, as buildRenderPort selects it.
  const remote = configured && !namesLocalRenderService(configured) ? configured : undefined;
  const url = remote || localRenderServiceUrl();
  const token =
    process.env.KILN_RENDER_TOKEN ?? (!remote ? process.env.RENDER_SERVICE_TOKEN : undefined);
  const dir = options.serviceDir ?? renderServiceDir();
  const source = mode === 'cpu' ? undefined : renderServiceSourceFingerprint(dir);
  const autoStart = !remote && (options.autoSpawn !== false || mode === 'gpu');
  return async () => {
    if (mode === 'cpu')
      return {
        mode,
        target: 'cpu',
        configured: false,
        required: false,
        status: 'disabled',
        evidence: 'configuration-only',
      };
    const base: RenderCapabilities = {
      mode,
      target: remote ? 'remote' : 'local',
      configured: Boolean(remote),
      required: mode === 'gpu',
      status: 'unknown',
      autoStart,
      evidence: 'configuration-only',
    };
    // Origin is sufficient for identifying the endpoint. Never echo URL credentials or query secrets.
    try {
      base.endpoint = new URL(url).origin;
    } catch {
      /* Transport returns a bounded unknown result. */
    }
    if (!remote) {
      base.installation = localRenderServiceState(dir);
      if (base.installation === 'ready') base.dependencies = { ...RENDER_SERVICE_DEPENDENCIES };
    }
    const probe = await readRenderServiceHealth(url, { token });
    if (probe.kind === 'service') {
      if (!source || probe.health.compatibility.sourceFingerprint !== source)
        return {
          ...base,
          status: 'unavailable',
          reason:
            'Renderer source differs from this installation; use the same Kiln build on both hosts.',
          evidence: 'health-only',
        };
      const authentication = !probe.health.authRequired
        ? 'not-required'
        : token
          ? 'configured-unverified'
          : 'missing';
      return {
        ...base,
        configured: true,
        rendererId: probe.health.rendererId,
        dependencies: { ...probe.health.compatibility.dependencies },
        authentication,
        status:
          authentication === 'missing'
            ? 'authentication-required'
            : authentication === 'configured-unverified'
              ? 'authentication-unverified'
              : 'available',
        ...(authentication === 'missing'
          ? { reason: 'Set KILN_RENDER_TOKEN to the matching renderer token.' }
          : {}),
        evidence: 'health-only',
      };
    }
    if (probe.kind === 'absent') {
      if (!remote && autoStart && (base.installation === 'ready' || options.injectedStart))
        return {
          ...base,
          configured: true,
          status: 'on-demand',
          reason: 'Starts on render demand; GPU readiness has not been tested.',
        };
      return {
        ...base,
        status: 'unavailable',
        reason: remote
          ? 'No service is listening at the selected remote endpoint.'
          : base.installation !== 'ready'
            ? explainRenderServiceState(base.installation!, dir)
            : 'No local service is listening and automatic startup is disabled.',
      };
    }
    return {
      ...base,
      status: probe.kind === 'unknown' ? 'unknown' : 'unavailable',
      reason: 'reason' in probe ? probe.reason : 'The selected endpoint is not a Kiln renderer.',
    };
  };
}
