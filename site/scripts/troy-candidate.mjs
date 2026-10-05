import { assetPath } from './mirror-core.mjs';
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
