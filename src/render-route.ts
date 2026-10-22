/** Dependency-free reading of renderer status; the registry imports it without Node-only edges. */
import type { RenderCapabilities } from './render-capabilities';

/**
 * What the next render uses, stated as fields (#206): agents inferred it from `configured`,
 * `status` and prose. `activeRoute` is the route this session attempts; `ready` says that
 * route can serve now; an active `fallback` means views will be CPU geometry, never material
 * evidence. A scene that needs no PBR shading still renders on CPU over a GPU route, so each
 * render's `viewFidelity` stays the authority.
 */
export interface NextRenderRoute {
  ready: boolean;
  activeRoute: 'gpu' | 'cpu';
  fallback: { active: false } | { active: true; materialFaithful: false; reason: string };
}

/** GPU statuses a configured route can serve: verified, startable, or token not yet checked. */
const GPU_SERVES = new Set<RenderCapabilities['status']>([
  'available',
  'on-demand',
  'authentication-unverified',
]);

export function nextRenderRoute(renderer: RenderCapabilities): NextRenderRoute {
  const fallback = (reason: string): NextRenderRoute['fallback'] => ({
    active: true,
    materialFaithful: false,
    reason,
  });
  if (!renderer.configured)
    return {
      ready: true,
      activeRoute: 'cpu',
      fallback: fallback(
        renderer.reason ??
          (renderer.mode === 'cpu'
            ? 'This host selected CPU rendering; views show geometry, not materials.'
            : 'No GPU renderer is attached to this session; views show geometry, not materials.'),
      ),
    };
  if (GPU_SERVES.has(renderer.status))
    return { ready: true, activeRoute: 'gpu', fallback: { active: false } };
  // A required GPU fails the render instead of degrading.
  return {
    ready: false,
    activeRoute: 'gpu',
    fallback: renderer.required
      ? { active: false }
      : fallback(
          `GPU renderer ${renderer.status}${renderer.reason ? `: ${renderer.reason}` : ''}. Renders degrade to CPU geometry views.`,
        ),
  };
}
