/** Every source pin must identify one sealed downloadable model. Interior metadata stays authoritative. */
export function foundryInventory({ pack, assetMap, campusMap, sums, licenceLines }) {
  const paths = new Set();
  const slugs = new Set();
  const items = [];
  const placements = [...pack.models, ...(pack.source.unplaced ?? []).map(item => ({ id: item.id, path: item.file }))];
  for (const [key, source] of Object.entries(pack.source.models)) {
    const candidates = placements.filter(item => item.id === key);
    if (candidates.length !== 1) throw new Error(`${key}: expected exactly one placed or unplaced file`);
    const path = candidates[0].path;
    if (!/^models\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.glb$/.test(path) || paths.has(path)) throw new Error(`${key}: unsafe or duplicate model path`);
    const slug = path.split('/').at(-1).slice(0, -4).toLowerCase();
    if (slugs.has(slug)) throw new Error(`${key}: duplicate download slug ${slug}`);
    paths.add(path); slugs.add(slug);
    if (!sums.has(path) || !licenceLines.has(path)) throw new Error(`${key}: missing sealed model or licence`);
    const entity = assetMap.entities[key];
    let group;
    if (entity) {
      group = 'interior';
      if (entity.glb !== path) throw new Error(`${key}: interior asset map path differs`);
    } else if ((pack.source.structures ?? []).includes(key)) group = 'campus';
    else if (Object.hasOwn(pack.source.vehicles ?? {}, key)) group = 'vehicles';
    else {
      const record = campusMap?.models?.[key];
      if (campusMap?.schema !== 'foundry-floor.campus-assets/1' || !['vegetation', 'freight'].includes(record?.kind)) throw new Error(`${key}: unknown campus model`);
      for (const field of ['asset', 'revision', 'bytes', 'sha256', 'author', 'requestedEffort', 'confirmedEffort']) if (source[field] !== record[field]) throw new Error(`${key}: campus ${field} differs from source pin`);
      if (record.path !== path) throw new Error(`${key}: campus path differs`);
      group = record.kind;
    }
    items.push({ key, source, path, slug, group, entity, placed: pack.models.some(item => item.id === key), unplacedWhy: (pack.source.unplaced ?? []).find(item => item.id === key)?.why ?? null });
  }
  const sealed = [...sums.keys()].filter(path => path.startsWith('models/') && path.endsWith('.glb'));
  if (sealed.length !== paths.size || sealed.some(path => !paths.has(path)) || licenceLines.size !== paths.size || placements.length !== paths.size) throw new Error('Foundry model inventory is incomplete or duplicated');
  for (const key of Object.keys(assetMap.entities)) if (!items.some(item => item.key === key)) throw new Error(`${key}: interior model omitted`);
  for (const key of Object.keys(campusMap?.models ?? {})) if (!items.some(item => item.key === key)) throw new Error(`${key}: campus model omitted`);
  return items;
}
