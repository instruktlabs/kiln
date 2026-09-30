import type { ViewFidelityV1 } from '../composer/render-port';

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A saved preview drawn from exactly the bytes the save persists is a view of
 * that artifact. Upgrade only a full-asset view whose input hash matches the
 * persisted GLB; derivative surfaces and other bytes keep their provenance.
 */
export async function persistedPreviewFidelity(
  fidelity: unknown,
  glb: Uint8Array,
): Promise<unknown> {
  const view = fidelity as (Partial<ViewFidelityV1> & { derivativeLabel?: unknown }) | undefined;
  if (
    !view ||
    typeof view !== 'object' ||
    view.version !== 'kiln.view-fidelity.v1' ||
    view.derivativeLabel !== undefined ||
    view.inputGlbSha256 !== (await sha256(glb))
  )
    return fidelity;
  return {
    ...view,
    exactArtifact: true,
    reasonCodes: (view.reasonCodes ?? []).filter((code) => code !== 'IN_LOOP_BUILD_NOT_PERSISTED'),
  };
}
