// One program per camera projection.
//
// three's node material compiles `positionViewDirection` from the camera of the first draw
// (`nodes/accessors/Position.js`, the same in 0.186 and 0.187): the constant (0, 0, 1) for an
// orthographic camera, per-fragment for a perspective one. Its program cache key ignores the
// projection (0.187 keys render contexts by camera type, but `RenderObject.getCacheKey` still
// does not name it), so a perspective view drawn after orthographic views in one request reuses the
// orthographic program and shades its reflections from the wrong direction. Naming the
// projection in the program cache key, and marking the material for update when it changes,
// makes three build the program for the camera that is drawing. No three import.

const PROJECTION = Symbol('kiln.renderService.projection');
const BASE_KEY = Symbol('kiln.renderService.baseProgramCacheKey');

function keyedProgramCacheKey() {
  return `${this[BASE_KEY]()}|projection:${this[PROJECTION]}`;
}

/** Key every material under `root` to `camera`'s projection before drawing with it. */
export function keyMaterialsByProjection(root, camera) {
  const projection = camera.isOrthographicCamera ? 'orthographic' : 'perspective';
  root.traverse((o) => {
    for (const mat of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      if (mat[PROJECTION] === projection) continue;
      if (mat[BASE_KEY] === undefined) {
        mat[BASE_KEY] = mat.customProgramCacheKey.bind(mat);
        mat.customProgramCacheKey = keyedProgramCacheKey;
      }
      mat[PROJECTION] = projection;
      mat.needsUpdate = true;
    }
  });
}
