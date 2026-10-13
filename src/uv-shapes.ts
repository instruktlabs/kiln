/** Transform existing UV0 explicitly. Projection lives in uv-project.ts. */
import * as THREE from 'three';

export interface RemapUVOptions {
  /** U and V multipliers. Identity by default; negative values mirror an axis. */
  scale?: [number, number];
  /** U and V offsets applied after scaling. */
  offset?: [number, number];
}

/** Remap existing UV0 on an owned clone. Does not generate/project UVs.
 * Nonidentity scaling invalidates tangents; pure offsets preserve them. */
export function remapUV(
  geo: THREE.BufferGeometry,
  options: RemapUVOptions = {},
): THREE.BufferGeometry {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => !['scale', 'offset'].includes(key))
  ) {
    throw new Error('remapUV: options may contain only scale and offset.');
  }
  const scale: [number, number] = options.scale === undefined ? [1, 1] : options.scale;
  const offset: [number, number] = options.offset === undefined ? [0, 0] : options.offset;
  for (const [label, value] of Object.entries({ scale, offset })) {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite))
      throw new Error(`remapUV: ${label} must contain two finite numbers.`);
  }
  const source = geo.getAttribute('uv');
  const positions = geo.getAttribute('position');
  if (source?.itemSize !== 2 || !positions || source.count !== positions.count) {
    throw new Error(
      'remapUV: existing UV0 with two components per vertex is required; project or unwrap first.',
    );
  }
  const values = new Float32Array(source.count * 2);
  for (let i = 0; i < source.count; i++) {
    const u = source.getX(i);
    const v = source.getY(i);
    const nextU = Math.fround(u * scale[0] + offset[0]);
    const nextV = Math.fround(v * scale[1] + offset[1]);
    if (![u, v, nextU, nextV].every(Number.isFinite))
      throw new Error('remapUV: UV values and mapped Float32 results must be finite.');
    values[i * 2] = nextU;
    values[i * 2 + 1] = nextV;
  }
  const cloned = geo.clone();
  // BufferGeometry.clone() shares userData; owned UV results must not write
  // warnings or later atlas bindings back into their source geometry.
  cloned.userData = structuredClone(geo.userData);
  cloned.setAttribute('uv', new THREE.Float32BufferAttribute(values, 2));
  if ((scale[0] !== 1 || scale[1] !== 1) && cloned.hasAttribute('tangent')) {
    cloned.deleteAttribute('tangent');
    const previous = cloned.userData.kilnAttributeWarnings;
    cloned.userData.kilnAttributeWarnings = [
      ...(Array.isArray(previous) ? previous : []),
      {
        code: 'UV_REMAP_TANGENTS_DROPPED',
        message: 'UV scaling invalidated tangents; regenerate them when needed for normal mapping.',
      },
    ];
  }
  return cloned;
}
