import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import { hashBytes } from './mirror-core.mjs';

/** A tiny but valid GLB: one triangle under a named node. `tag` makes each tier's bytes differ. */
export function fixtureGlb(tag = 'fixture') {
  const data = JSON.stringify({ asset: { version: '2.0', generator: tag }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Bridge', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], accessors: [{ count: 3, min: [0, 0, 0], max: [1, 1, 1] }, { count: 3 }], materials: [{}] });
  const length = Math.ceil(Buffer.byteLength(data) / 4) * 4;
  const glb = Buffer.alloc(length + 20, 32);
  glb.write('glTF');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  glb.write(data, 20);
  return glb;
}

export const save = async (path: string, bytes: string | Uint8Array) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
};
export const saveJson = (path: string, value: unknown) => save(path, JSON.stringify(value, null, 2));
export const seal = (bytes: Uint8Array) => ({ bytes: bytes.length, sha256: hashBytes(bytes) });
export const pngBytes = (colour = '#aab1bc', size = 4) => sharp({ create: { width: size, height: size, channels: 4, background: colour } }).png().toBuffer();

export const ASSET_ID = 'a_fixture';
/** Every fixture revision was saved inside this run. */
export const RUN = { stage: 'first', startedAt: '2026-09-29T10:00:00.000Z', endedAt: '2026-09-29T11:00:00.000Z' };
export const TIERS = [
  { tier: 'full', revision: 'r_full', parent: 'r_full_parent', licensed: { revision: 'r_full_lic', parent: 'r_lic_parent' }, glbFile: 'golden-gate.glb', metadata: 'golden-gate.kiln-metadata.json' },
  { tier: 'web', revision: 'r_web', parent: 'r_web_parent', licensed: { revision: 'r_web_lic', parent: 'r_lic_parent' }, glbFile: 'golden-gate-web.glb', metadata: 'golden-gate-web.kiln-metadata.json' },
  { tier: 'far', revision: 'r_far', parent: 'r_far_parent', licensed: { revision: 'r_far_lic', parent: 'r_lic_parent' }, glbFile: 'golden-gate-far.glb', metadata: 'golden-gate-far.kiln-metadata.json' },
] as const;

/**
 * An author output folder, a library of saved revisions (each tier's revision plus its parent, so the lineage
 * can be walked), and the data files the update reads: accepted pins, lineage and recorded runs.
 */
export async function buildBridgeFixture(root: string) {
  const outputs = join(root, 'outputs');
  const library = join(root, 'library');
  const data = join(root, 'data');
  const licence = strToU8('Golden Gate Bridge - fixture licence\nSPDX-License-Identifier: CC0-1.0\n');
  await save(join(outputs, 'ASSET-LICENSE.txt'), licence);
  const preview = await pngBytes('#123456', 8);
  const pins = [];
  for (const tier of TIERS) {
    const exported = fixtureGlb(`export-${tier.tier}`);
    const saved = fixtureGlb(`saved-${tier.tier}`);
    const source = strToU8(`// ${tier.tier} source\nconst PARAMS = { lod: '${tier.tier}' };\n`);
    const files = { 'asset.glb': seal(saved), 'source.kiln.js': seal(source), 'preview.png': seal(preview) };
    const manifest = strToU8(JSON.stringify({ version: 1, assetId: ASSET_ID, revisionId: tier.revision, parentRevision: tier.parent, name: 'Golden Gate Bridge', createdAt: '2026-09-29T10:30:00.000Z', files: Object.fromEntries(Object.entries(files).map(([name, seal]) => [name, { bytes: seal.bytes, sha256: `sha256:${seal.sha256}` }])) }));
    const dir = join(library, tier.revision);
    await save(join(dir, 'manifest.json'), manifest);
    await save(join(dir, 'asset.glb'), saved);
    await save(join(dir, 'source.kiln.js'), source);
    await save(join(dir, 'preview.png'), preview);
    // A parent revision for each tier, so a lineage can name it.
    await saveJson(join(library, tier.parent, 'manifest.json'), { version: 1, assetId: ASSET_ID, revisionId: tier.parent, parentRevision: tier.tier === 'full' ? null : 'r_full_parent', createdAt: '2026-09-29T10:10:00.000Z', files: {} });
    await save(join(outputs, tier.glbFile), exported);
    await saveJson(join(outputs, tier.metadata), { version: 'kiln.runtime-metadata.v1', source: { assetId: ASSET_ID, revisionId: tier.revision, glbSha256: `sha256:${hashBytes(saved)}`, sourceSha256: `sha256:${hashBytes(source)}` }, scenes: [] });
    pins.push({ tier: tier.tier, revision: tier.revision, parent: tier.parent, glb: { file: tier.glbFile, ...seal(exported), triangles: 1 }, metadata: tier.metadata, licensed: tier.licensed });
  }
  const tiers = { schemaVersion: 1, delivery: 'review-x', assetId: ASSET_ID, licence: { file: 'ASSET-LICENSE.txt', ...seal(licence), section: 'Fix-up 1' }, tiers: pins };
  const entry = (revisionId: string, parentRevisionId: string | null, stage: string) => ({ stage, revisionId, parentRevisionId, request: RUN.stage });
  const lineage = {
    schemaVersion: 1,
    assetId: ASSET_ID,
    full: [entry('r_full_parent', null, 'Parent'), entry('r_full', 'r_full_parent', 'Review')],
    tiers: { web: [entry('r_web_parent', null, 'Web parent'), entry('r_web', 'r_web_parent', 'Web review')], far: [entry('r_far_parent', null, 'Far parent'), entry('r_far', 'r_far_parent', 'Far review')] },
  };
  // Each tier branches from a revision the full chain contains, as the real delivery does.
  lineage.tiers.web[0].parentRevisionId = 'r_full_parent';
  lineage.tiers.far[0].parentRevisionId = 'r_full_parent';
  await saveJson(join(data, 'standalone/golden-gate-tiers.json'), tiers);
  await saveJson(join(data, 'standalone/golden-gate-lineage.json'), lineage);
  const requests = [{ ...RUN, requestedModel: 'gpt-6-astra', requestedEffort: 'ultra', harness: 'codex', harnessVersion: '0.157.1', confirmedEffort: null }];
  await saveJson(join(data, 'bridge-requests.json'), requests);
  return { outputs, library, data, tiers, lineage, requests, licence, preview };
}
