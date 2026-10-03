import {
  encodeAssetBundle,
  type AssetLibrary,
  type AssetManifest,
  type AssetRecord,
} from './assets';
import { exportAssetGlb, type AssetGlbExport } from './asset-export';

export interface AssetLink {
  type: 'resource_link';
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  annotations: { audience: ('user' | 'assistant')[]; priority: number };
}

/**
 * Who each artifact is for, and how much it costs to resolve.
 *
 * A `resource_link` deliberately carries no bytes, so the client decides whether to
 * spend context resolving one. `size` and `annotations.audience` are the two fields
 * the spec gives it for that decision, and emitting neither leaves every client
 * guessing from a MIME type -- including the ones that guess "inline everything".
 *
 * `asset.glb` and `preview.png` are download artifacts: the model already receives
 * rendered views as image blocks from `kiln_render` and gets geometry from metrics,
 * so decoding a mesh or re-reading a render buffer buys it nothing. `source.kiln.js`
 * is addressed to both, because re-reading source is a legitimate model move even
 * though `kiln_source` is the cheaper way to do it.
 */
const audiences: Record<string, ('user' | 'assistant')[]> = {
  'asset.glb': ['user'],
  'preview.png': ['user'],
  'manifest.json': ['user'],
  'source.kiln.js': ['user', 'assistant'],
};
const priorities: Record<string, number> = {
  'asset.glb': 0.9,
  'preview.png': 0.8,
  'source.kiln.js': 0.5,
  'manifest.json': 0.3,
};

/**
 * `editable.zip` is deliberately absent. It is a bundle of the files listed beside
 * it, so a client that resolves every advertised link pays for the same bytes twice,
 * and it is the largest entry while being the only derived one. It stays readable at
 * its own URI -- which is what the widget's "Editable bundle" button reads -- and it
 * stays in `downloadUrls` wherever those are configured; it is only unadvertised.
 */
export function assetLinks(collection: string, manifest: AssetManifest): AssetLink[] {
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2)).byteLength;
  return [...Object.keys(manifest.files), 'manifest.json'].map((name) => ({
    type: 'resource_link' as const,
    name,
    uri: `kiln://assets/${collection}/${manifest.assetId}/${manifest.revisionId}/${name}`,
    mimeType: assetMime(name),
    size: manifest.files[name]?.bytes ?? manifestBytes,
    annotations: {
      audience: audiences[name] ?? ['user'],
      priority: priorities[name] ?? 0.3,
    },
  }));
}
export function assetMime(name: string): string {
  return name.endsWith('.glb')
    ? 'model/gltf-binary'
    : name.endsWith('.png')
      ? 'image/png'
      : name.endsWith('.zip')
        ? 'application/zip'
        : name.endsWith('.json')
          ? 'application/json'
          : 'text/javascript';
}

/** Derived resources are deterministic, read-only, and never replace a saved revision. */
export async function runtimeAssetLinks(
  collection: string,
  record: AssetRecord,
  derived?: Extract<AssetGlbExport, { profile: 'runtime' }>,
): Promise<AssetLink[]> {
  const output = derived ?? (await exportAssetGlb(record, { profile: 'runtime' }));
  if (output.profile !== 'runtime') throw new Error('Expected runtime export');
  return [
    { name: 'runtime.glb', bytes: output.glb },
    { name: output.metadata.name, bytes: output.metadata.bytes },
  ].map(({ name, bytes }) => ({
    type: 'resource_link',
    name,
    uri: `kiln://assets/${collection}/${record.manifest.assetId}/${record.manifest.revisionId}/${name}`,
    mimeType: assetMime(name),
    size: bytes.length,
    annotations: { audience: ['user'], priority: name.endsWith('.glb') ? 0.9 : 0.3 },
  }));
}
export async function readAssetResource(
  library: AssetLibrary,
  uri: string,
): Promise<{ bytes: Uint8Array; mimeType: string; name: string }> {
  const match =
    /^kiln:\/\/assets\/([a-z][a-z0-9_-]{0,79})\/([a-z][a-z0-9_-]{0,79})\/([a-z][a-z0-9_-]{0,79})\/(asset\.glb|runtime\.glb|runtime\.kiln-metadata\.json|source\.kiln\.js|preview\.png|manifest\.json|editable\.zip)$/.exec(
      uri,
    );
  if (!match) throw new Error('Unknown asset resource');
  const collection = match[1]!;
  const asset = match[2]!;
  const revision = match[3]!;
  const name = match[4]!;
  const record = await library.read(collection, asset, revision);
  if (name === 'runtime.glb' || name === 'runtime.kiln-metadata.json') {
    const output = await exportAssetGlb(record, { profile: 'runtime' });
    if (output.profile !== 'runtime') throw new Error('Expected runtime export');
    return {
      bytes: name === 'runtime.glb' ? output.glb : output.metadata.bytes,
      mimeType: assetMime(name),
      name,
    };
  }
  const bytes =
    name === 'editable.zip'
      ? await exportLibraryAssetBundle(library, [record])
      : name === 'manifest.json'
        ? new TextEncoder().encode(JSON.stringify(record.manifest, null, 2))
        : record.files[name];
  if (!bytes) throw new Error('Asset file unavailable');
  return { bytes, mimeType: assetMime(name), name };
}

/** One host hook owns exact dependency closure for CLI, MCP and gallery downloads. */
export async function exportLibraryAssetBundle(
  library: AssetLibrary,
  records: AssetRecord[],
): Promise<Uint8Array> {
  return library.exportBundle ? library.exportBundle(records) : encodeAssetBundle(records);
}
