/** One explicit migration of the reviewed legacy Bridge metadata. Not a general text repair. */
export function repairBridgeMetadata(bytes) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    throw new Error('Bridge migration expects the legacy invalid UTF-8 input');
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  const high = [...bytes].filter(byte => byte > 127);
  if (high.length !== 7 || high.filter(byte => byte === 0xb1).length !== 6 || high.filter(byte => byte === 0xb2).length !== 1) {
    throw new Error('Unexpected Bridge legacy symbols; inspect the input before migration');
  }
  const text = new TextDecoder('windows-1252').decode(bytes);
  const before = JSON.parse(text);
  if (!before.tile_layout?.includes('\u00b12') || !before.water_inputs?.signed_shore_distance?.includes('\u00b1300') || !before.collision?.conservative_filter?.includes('512\u00b2')) {
    throw new Error('Unexpected Bridge descriptive fields');
  }
  const repaired = new TextEncoder().encode(text);
  const after = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(repaired));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Bridge metadata meaning changed');
  return repaired;
}
