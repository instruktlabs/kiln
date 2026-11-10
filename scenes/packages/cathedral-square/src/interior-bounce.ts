import { AmbientLight, DataTexture, LinearFilter, Vector3 } from 'three/webgpu';
import { dot, max, normalWorld, positionWorld, smoothstep, texture, vec2, vec3 } from 'three/tsl';

type Point = readonly [number, number];
type Plane = readonly [number, number, number];
type Region = { planes: Plane[] };
const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
function polygon(points: Point[]): Region {
  const center = points.reduce((p, q) => [p[0] + q[0] / points.length, p[1] + q[1] / points.length], [0, 0]);
  const planes = points.map((a, i): Plane => {
    const b = points[(i + 1) % points.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let x = (b[1] - a[1]) / length, z = (a[0] - b[0]) / length, limit = x * a[0] + z * a[1];
    if (center[0] * x + center[1] * z > limit) { x = -x; z = -z; limit = -limit; }
    return [x, z, limit];
  });
  return { planes };
}
const box = (x0: number, x1: number, z0: number, z1: number) => polygon([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
const APSE_X = -57.4, CROSSING_X = -31.1, SECTORS = 7, ANGLE = Math.PI / SECTORS;
const AMBULATORY_APOTHEM = 13.1 * Math.cos(ANGLE / 2), CHAPEL_CENTER = AMBULATORY_APOTHEM + 3;
function hemicycle(apothem: number): Region {
  const planes: Plane[] = [[1, 0, APSE_X + 1], [0, 1, apothem / Math.cos(ANGLE / 2)], [0, -1, apothem / Math.cos(ANGLE / 2)]];
  for (let k = 0; k < SECTORS; k++) {
    const angle = -(k + .5) * ANGLE, x = Math.sin(angle), z = Math.cos(angle);
    planes.push([x, z, APSE_X * x + apothem]);
  }
  return { planes };
}
// Inner wall faces from the selected cathedral's authored plan: seven faceted
// ambulatory sectors and seven separate chapels. The outdoor gaps between
// chapels are deliberately excluded; the exported paving also covers those gaps.
const lower = [box(APSE_X - 1, 60, -13.1, 13.1), box(CROSSING_X - 13.1, CROSSING_X + 13.1, -26.3, 26.3), hemicycle(AMBULATORY_APOTHEM)];
const upper = [box(APSE_X - 1, 60, -6.2, 6.2), box(CROSSING_X - 6.2, CROSSING_X + 6.2, -26.3, 26.3), hemicycle(6.5 * Math.cos(ANGLE / 2))];
const chapels: Region[] = [];
for (let k = 0; k < SECTORS; k++) {
  const angle = -(k + .5) * ANGLE, c = Math.cos(angle), s = Math.sin(angle);
  const world = (u: number, v: number): Point => [APSE_X + u * c + v * s, -u * s + v * c];
  const corners = Array.from({ length: 6 }, (_, i) => {
    const a = (-108 + i * 43.2) * Math.PI / 180;
    return world(2.5 * Math.sin(a), CHAPEL_CENTER + 2.5 * Math.cos(a));
  });
  chapels.push(polygon(corners));
  // A conservative neck inside the actual tapered side walls; overlap the
  // chapel and ambulatory so a lighting seam does not cross the doorway.
  chapels.push(polygon([world(-1.55, AMBULATORY_APOTHEM - .8), world(1.55, AMBULATORY_APOTHEM - .8), world(1.55, CHAPEL_CENTER), world(-1.55, CHAPEL_CENTER)]));
}
function regionWeight(regions: Region[], x: number, z: number): number {
  let value = 0;
  for (const region of regions) {
    let distance = Infinity;
    for (const [nx, nz, limit] of region.planes) distance = Math.min(distance, limit - nx * x - nz * z);
    // Inner faces must receive fill. Fade within the actual wall, whose minimum
    // thickness is .5m; .22m plus the field's <.19m interpolation radius stays
    // inside its outer face. Height falloff, not a floor stripe, supplies depth.
    value = Math.max(value, smooth(-.22, -.02, distance));
  }
  return value;
}
function planWeights(x: number, z: number) {
  const sanctuary = .85 + .15 * smooth(3, 11, Math.hypot(x + 56.4, z));
  return [regionWeight(lower, x, z), regionWeight(upper, x, z), regionWeight(chapels, x, z), sanctuary];
}
/** Artistic indirect fill, never a visibility claim for a direct light or AO. */
export function interiorBounceWeight(p: Vector3): number {
  const [low, high, chapel, sanctuary] = planWeights(p.x, p.z);
  const volume = Math.max(low * (1 - smooth(18, 22, p.y)), high * (1 - smooth(32, 38, p.y)), chapel * (1 - smooth(10, 14.2, p.y)));
  return volume * sanctuary * smooth(-.12, 0, p.y) * (1 - .35 * smooth(4, 32, p.y));
}
const SKY_DIRECTION = new Vector3(.38, .74, -.55).normalize();
/** A broad hemispherical lobe preserves modeled lit/shaded planes and normal-map detail. */
export function interiorBounceDirection(normal: Vector3): number { return .825 + .375 * normal.dot(SKY_DIRECTION); }

/** An independently owned field for lighting or an indirect-only AO context. */
export function createInteriorMask() {
  const width = 512, height = 256, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const values = planWeights(-80 + (x + .5) / width * 144, -30 + (y + .5) / height * 60);
    for (let channel = 0; channel < 4; channel++) data[(y * width + x) * 4 + channel] = Math.round(255 * values[channel]);
  }
  const field = new DataTexture(data, width, height); field.minFilter = field.magFilter = LinearFilter; field.needsUpdate = true;
  const p = positionWorld, uv = p.xz.sub(vec2(-80, -30)).div(vec2(144, 60)), mask = texture(field, uv);
  const volume = max(max(mask.r.mul(smoothstep(18, 22, p.y).oneMinus()), mask.g.mul(smoothstep(32, 38, p.y).oneMinus())), mask.b.mul(smoothstep(10, 14.2, p.y).oneMinus()));
  const weight = volume.mul(mask.a).mul(smoothstep(-.12, 0, p.y)).mul(smoothstep(4, 32, p.y).mul(.35).oneMinus());
  let disposed = false;
  return { weight, field, dispose() { if (disposed) return; disposed = true; field.dispose(); } };
}
export function createInteriorBounce() {
  const mask = createInteriorMask();
  const light = new AmbientLight(0xe5dccb, 1.6); light.name = 'Interior shaped diffuse bounce';
  const shaped = dot(normalWorld, vec3(SKY_DIRECTION.x, SKY_DIRECTION.y, SKY_DIRECTION.z)).mul(.375).add(.825);
  const colorNode = vec3(light.color.r, light.color.g, light.color.b).mul(light.intensity).mul(mask.weight).mul(shaped);
  (light as AmbientLight & { colorNode?: typeof colorNode }).colorNode = colorNode;
  let disposed = false;
  return { light, field: mask.field, dispose() { if (disposed) return; disposed = true; light.removeFromParent(); mask.dispose(); } };
}
