import { assetPath, hashBytes } from './mirror-core.mjs';
import { publicTroyHtml } from './troy-html.mjs';

/** Replace maintained modules, retaining verified runtime inputs and the host lifecycle hook. */
export function overlayTroyWeb(seed, sources) {
  // Qualification pages and previous compiled chunks are not inputs to a new public build.
  // Keep the original archive intact; regenerate the bundle from maintained source.
  const files = Object.fromEntries(Object.entries(seed).filter(([path]) => !path.startsWith('web/qualification/') && !path.startsWith('web/bundle/')));
  for (const [path, bytes] of Object.entries(sources)) files[`web/${assetPath(path)}`] = bytes;
  if (!files['web/index.html'] || !files['web/main.mjs'] || !files['web/site-frame.mjs']) throw new Error('Missing Troy browser entry or lifecycle hook');
  let html = files['web/index.html'].toString().replaceAll('"/vendor/three/', '"./vendor/three/');
  if (!html.includes('src="./site-frame.mjs"')) html = html.replace('</body>', '<script type="module" src="./site-frame.mjs"></script></body>');
  files['web/index.html'] = publicTroyHtml(Buffer.from(html));
  return files;
}

/**
 * The bounds `web/inputs.json` records for a scene model: three.js `Box3.setFromObject(scene, true)` over the loaded
 * GLB (every vertex through its world matrix), with its size and centre. Textures are dropped before loading because
 * Node has no image decoder and bounds read no material.
 */
export async function troySceneBounds(bytes) {
  const { Box3, Vector3 } = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const data = Buffer.from(bytes), jsonLength = data.readUInt32LE(12), json = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  delete json.textures; delete json.images; delete json.samplers;
  for (const material of json.materials ?? []) {
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture', 'extensions']) delete material[key];
    if (material.pbrMetallicRoughness) { delete material.pbrMetallicRoughness.baseColorTexture; delete material.pbrMetallicRoughness.metallicRoughnessTexture; }
  }
  for (const key of ['extensionsUsed', 'extensionsRequired']) if (json[key]) json[key] = json[key].filter(name => !/texture|material/i.test(name));
  let text = Buffer.from(JSON.stringify(json)); text = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const rest = data.subarray(20 + jsonLength), header = Buffer.alloc(20);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + text.length + rest.length, 8); header.writeUInt32LE(text.length, 12); header.write('JSON', 16);
  const glb = Buffer.concat([header, text, rest]);
  const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '');
  gltf.scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(gltf.scene, true);
  return { min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new Vector3()).toArray(), center: box.getCenter(new Vector3()).toArray() };
}

/**
 * Put selected revisions into the scene: each replacement's bytes go to its `web/inputs.json` url, and its input entry
 * takes the new revision, SHA-256, size, bounds and source path. Hero equipment and shield support records that name
 * the replaced GLB take the new revision identity; their descriptive fields and review states are kept.
 * `web/transport.json` is regenerated from the staged bytes by prepareRuntimeTransport.
 */
export async function replaceTroySceneModels(seed, replacements) {
  const files = { ...seed }, inputs = JSON.parse(Buffer.from(files['web/inputs.json']).toString()), replaced = [];
  for (const { slug, assetId, revisionId, bytes, sourceSha256 } of replacements) {
    const entry = inputs.assets.find(asset => asset.slug === slug);
    if (!entry) throw new Error(`${slug} is not a Troy scene input`);
    if (entry.assetId !== assetId) throw new Error(`${slug}: scene input names asset ${entry.assetId}, not ${assetId}`);
    const sha256 = `sha256:${hashBytes(bytes)}`;
    if (sha256 === entry.sha256) throw new Error(`${slug}: replacement changes nothing`);
    const from = { revisionId: entry.revisionId, sha256: entry.sha256, bytes: entry.bytes };
    files[`web/${assetPath(entry.url)}`] = Buffer.from(bytes);
    Object.assign(entry, { revisionId, sha256, bytes: bytes.length, bounds: await troySceneBounds(bytes), sourceFile: entry.sourceFile.replace(`/${from.revisionId}/`, `/${revisionId}/`) });
    for (const record of [...(inputs.heroEquipment?.assets ?? []), ...(inputs.shieldSupport?.assets ?? [])]) {
      if (record.artifactGlbSha256 !== from.sha256) continue;
      if (!/^sha256:[0-9a-f]{64}$/.test(sourceSha256 ?? '')) throw new Error(`${slug}: equipment records need the new source SHA-256`);
      Object.assign(record, { revisionId, programRef: `p_${sourceSha256.slice(7, 19)}`, sourceSha256, artifactGlbSha256: sha256 });
    }
    replaced.push({ slug, from, to: { revisionId, sha256, bytes: bytes.length } });
  }
  files['web/inputs.json'] = Buffer.from(JSON.stringify(inputs, null, 2) + '\n');
  return { files, replaced };
}

/** The gallery uses the same selected revisions as the two download profiles. */
export function updateTroyCatalog(previous, group, release) {
  if (!/^[a-z0-9-]+$/.test(release)) throw new Error('Invalid Troy release');
  const catalog = structuredClone(previous), base = `/scene-packs/troy/${release}/`;
  const replace = value => typeof value === 'string' ? value.replaceAll(previous.base, base) : Array.isArray(value) ? value.map(replace) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, value]) => [key,replace(value)])) : value;
  const result = replace(catalog);
  result.base = base; result.release = release;
  for (const asset of result.assets) {
    const selected = group.assets.find(row => row.slug === asset.slug);
    if (!selected) throw new Error(`Missing selected Troy asset: ${asset.slug}`);
    asset.assetId = selected.assetId; asset.revisionId = selected.revisionId;
    asset.runtimeDownload = {...selected.runtimeDownload, url:`${base}models/${asset.slug}.glb`};
    delete asset.runtimeDownload.path;
  }
  return result;
}
