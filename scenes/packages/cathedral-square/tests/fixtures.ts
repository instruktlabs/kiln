import { fileURLToPath } from 'node:url';
import manifest from '../ASSET-MANIFEST.json';
import { findSceneFixture } from '../../../scripts/release-inputs';

/** Restored release bytes first; optional local staging must match the exact saved pin. */
export function cathedralFixture(id: string): string | undefined {
  const pin = manifest.assets.find(asset => asset.id === id);
  if (!pin) throw new Error(`Unknown Cathedral fixture: ${id}`);
  const staged = fileURLToPath(new URL(`../standalone/public/assets/models/${id}.glb`, import.meta.url));
  const override = id === 'cathedral' ? process.env.CATHEDRAL_COLLISION_ASSET : undefined;
  return findSceneFixture({ scene: 'cathedral-square', path: `models/${id}.glb`, sha256: pin.sha256, bytes: pin.bytes },
    { fallback: [...(override ? [override] : []), staged] });
}
