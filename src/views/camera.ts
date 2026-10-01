import { Vector3, Matrix4, Euler, Group, type Object3D } from 'three';
import { collectTriangles, compositingOrder, measureBounds, orbitDir } from './raster';
import { resolveBackdrop, type BackdropId } from './background';

export type CameraVec3 = [number, number, number];
export type CameraBounds = { min: CameraVec3; max: CameraVec3 };
export interface CameraSubjectV1 {
  path?: string;
  name?: string;
}
export type AssetCameraRequestV1 =
  | {
      type: 'orbit';
      azimuthDeg?: number;
      elevationDeg?: number;
      relativeTo?: 'world' | 'asset' | 'part';
      padding?: number;
    }
  | {
      type: 'explicit';
      projection: 'orthographic' | 'perspective';
      position: CameraVec3;
      target?: CameraVec3;
      relativeTo?: 'world' | 'asset' | 'part' | 'local';
      frame?: { origin?: CameraVec3; rotation?: CameraVec3 };
      framing?: 'explicit' | 'bounds';
      padding?: number;
      targetOffset?: CameraVec3;
      up?: CameraVec3;
      halfHeight?: number;
      fovDeg?: number;
      near?: number;
      far?: number;
    };
export interface CameraShotV1 {
  name?: string;
  subject?: CameraSubjectV1;
  visibility?: 'context' | 'isolate';
  /** Capture v2: exact paths or unambiguous names, hidden after subject isolation. */
  hide?: string[];
  camera?: AssetCameraRequestV1;
}
export interface ResolvedAssetCameraV1 {
  version: 'kiln.camera.v1';
  projection: 'orthographic' | 'perspective';
  position: CameraVec3;
  target: CameraVec3;
  up: CameraVec3;
  aspect: number;
  near: number;
  far: number;
  halfHeight?: number;
  fovDeg?: number;
}
export interface ResolvedCameraShotV1 {
  name: string;
  camera: ResolvedAssetCameraV1;
  subject: { path: string; name: string; bounds: CameraBounds };
  visibility: 'context' | 'isolate';
  /** Exact paths hidden for this shot. Framing still uses the selected subject's bounds. */
  hide?: string[];
}
const vec = (a: CameraVec3) => new Vector3(...a);
const tuple = (v: Vector3): CameraVec3 => [v.x || 0, v.y || 0, v.z || 0];
/** Common near-misses for camera keys, named in the unknown-key error. */
const KEY_HINTS: Readonly<Record<string, string>> = {
  fov: 'fovDeg',
  fovY: 'fovDeg',
  fieldOfView: 'fovDeg',
  lookAt: 'target',
  azimuth: 'azimuthDeg',
  elevation: 'elevationDeg',
};
function strict(value: object, keys: string[], label: string) {
  for (const key of Object.keys(value))
    if (!keys.includes(key)) {
      const hint = Object.hasOwn(KEY_HINTS, key) && keys.includes(KEY_HINTS[key]!);
      throw new Error(
        `${label}.${key} is unknown${hint ? `; use ${KEY_HINTS[key]}` : ''}; accepted keys: ${keys.join(', ')}`,
      );
    }
}
function finite(n: number, label: string) {
  if (!Number.isFinite(n)) throw new Error(`${label} must be finite`);
  return n;
}
function triple(v: CameraVec3, label: string) {
  if (!Array.isArray(v) || v.length !== 3 || v.some((n) => !Number.isFinite(n)))
    throw new Error(`${label} must contain three finite numbers`);
  return [...v] as CameraVec3;
}
/** Stable exact paths use URI-encoded names and same-name sibling occurrence indices. */
export function listCameraSubjects(
  root: unknown,
): Array<{ path: string; name: string; node: Object3D }> {
  const result: Array<{ path: string; name: string; node: Object3D }> = [];
  const visit = (node: Object3D, path: string) => {
    result.push({ node, path, name: node.name });
    const counts = new Map<string, number>();
    for (const child of node.children ?? []) {
      const count = counts.get(child.name) ?? 0;
      counts.set(child.name, count + 1);
      visit(child, `${path}/${encodeURIComponent(child.name)}[${count}]`);
    }
  };
  const node = root as Object3D;
  visit(node, `/${encodeURIComponent(node.name)}[0]`);
  return result;
}
export function selectCameraSubject(root: unknown, subject?: CameraSubjectV1) {
  if (subject) {
    strict(subject, ['path', 'name'], 'subject');
    if ((subject.path === undefined) === (subject.name === undefined))
      throw new Error('subject requires exactly one of path or name');
  }
  const all = listCameraSubjects(root);
  const matches = !subject
    ? [all[0]!]
    : all.filter((n) =>
        subject.path !== undefined ? n.path === subject.path : n.name === subject.name,
      );
  if (matches.length !== 1) throw new Error(subjectError(all, matches, subject));
  return matches[0]!;
}
function pathList(nodes: readonly { path: string }[], limit: number): string {
  const shown = nodes.slice(0, limit).map((n) => n.path);
  return `${shown.join(', ')}${nodes.length > limit ? `, and ${nodes.length - limit} more` : ''}`;
}
/** Name the candidates: every node sharing an ambiguous name, or similar names before the listing. */
function subjectError(
  all: readonly { path: string; name: string }[],
  matches: readonly { path: string }[],
  subject: CameraSubjectV1 | undefined,
): string {
  const query = subject?.name ?? subject?.path ?? '';
  if (matches.length > 1)
    return `ambiguous camera subject: ${matches.length} nodes are named ${JSON.stringify(query)}; choose one path: ${pathList(matches, 20)}`;
  const wanted = (
    subject?.name ?? decodeURIComponent(query.split('/').pop() ?? '').replace(/\[\d+\]$/, '')
  ).toLowerCase();
  const similar = wanted
    ? all.filter((n) => {
        const name = n.name.toLowerCase();
        return name.length > 0 && (name.includes(wanted) || wanted.includes(name));
      })
    : [];
  const rootPath = all[0]?.path;
  const misrooted =
    subject?.path !== undefined &&
    rootPath !== undefined &&
    query !== rootPath &&
    !query.startsWith(`${rootPath}/`);
  const missing =
    subject?.name !== undefined
      ? `no node is named ${JSON.stringify(query)}`
      : `no node has path ${JSON.stringify(query)}${misrooted ? `; paths start with ${rootPath}` : ''}`;
  // Similar names are the useful answer; the full listing only when there are none.
  return `missing camera subject: ${missing}${similar.length ? `; similar: ${pathList(similar, 10)}` : `; choose an exact path: ${pathList(all, 40)}`}`;
}
/**
 * Default near plane for an explicit perspective camera: half the distance from the
 * camera to the nearest drawable triangle's box, which clips nothing, and never below
 * 1 mm or above half the far plane. A 1 mm plane on a large asset wastes depth
 * precision and shows false z-fighting between faces a few decimetres apart.
 * Skinned or morphing geometry can move toward the camera after this measurement,
 * so it keeps the 1 mm floor.
 */
export function defaultPerspectiveNear(root: unknown, position: CameraVec3, far: number): number {
  const FLOOR = 0.001;
  let deforms = false;
  (root as Object3D).traverse((node) => {
    const mesh = node as Object3D & {
      isSkinnedMesh?: boolean;
      geometry?: { morphAttributes?: Record<string, unknown[]> };
    };
    if (mesh.isSkinnedMesh || (mesh.geometry?.morphAttributes?.['position']?.length ?? 0) > 0)
      deforms = true;
  });
  if (deforms) return FLOOR;
  const [px, py, pz] = position;
  let nearest = Number.POSITIVE_INFINITY;
  for (const { v } of collectTriangles(root as Object3D).tris) {
    const dx = Math.max(Math.min(v[0]!, v[3]!, v[6]!) - px, 0, px - Math.max(v[0]!, v[3]!, v[6]!));
    const dy = Math.max(Math.min(v[1]!, v[4]!, v[7]!) - py, 0, py - Math.max(v[1]!, v[4]!, v[7]!));
    const dz = Math.max(Math.min(v[2]!, v[5]!, v[8]!) - pz, 0, pz - Math.max(v[2]!, v[5]!, v[8]!));
    nearest = Math.min(nearest, Math.sqrt(dx * dx + dy * dy + dz * dz));
    if (nearest === 0) break;
  }
  if (!Number.isFinite(nearest)) return FLOOR;
  return Math.max(FLOOR, Math.min(nearest / 2, far / 2));
}
/** Match the legacy CPU projected-bounds fit; no camera-dependent source execution. */
export function cameraFromBounds(
  bounds: CameraBounds,
  dir: CameraVec3,
  padding = 1,
  up?: CameraVec3,
  sceneBounds: CameraBounds = bounds,
): ResolvedAssetCameraV1 {
  if (!Number.isFinite(padding) || padding <= 0 || padding > 100)
    throw new Error('padding must be in (0,100]');
  const target = vec(bounds.min).add(vec(bounds.max)).multiplyScalar(0.5);
  const z = vec(dir).normalize();
  if (!z.length()) throw new Error('camera direction must be non-zero');
  const hint = up ? vec(up) : Math.abs(z.y) > 0.99 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
  const x = hint.clone().cross(z).normalize();
  if (x.length() < 1e-9) throw new Error('camera up must not be collinear with view');
  const y = z.clone().cross(x);
  let extent = 1e-6;
  for (let i = 0; i < 8; i++) {
    const p = new Vector3(
      (i & 1 ? bounds.max : bounds.min)[0],
      (i & 2 ? bounds.max : bounds.min)[1],
      (i & 4 ? bounds.max : bounds.min)[2],
    ).sub(target);
    extent = Math.max(extent, Math.abs(p.dot(x)), Math.abs(p.dot(y)));
  }
  const depthMin = bounds.min.map((v, i) => Math.min(v, sceneBounds.min[i]!)) as CameraVec3;
  const depthMax = bounds.max.map((v, i) => Math.max(v, sceneBounds.max[i]!)) as CameraVec3;
  const radius = Math.max(vec(depthMax).distanceTo(target), vec(depthMin).distanceTo(target)) * 2;
  const distance = Math.max(radius * 2, 1);
  return {
    version: 'kiln.camera.v1',
    projection: 'orthographic',
    position: tuple(target.clone().addScaledVector(z, distance)),
    target: tuple(target),
    up: tuple(y),
    aspect: 1,
    near: Math.max(1e-6, distance - radius),
    far: distance + radius + 1,
    halfHeight: (extent * padding) / 0.9,
  };
}
export function validateResolvedAssetCamera(value: ResolvedAssetCameraV1): ResolvedAssetCameraV1 {
  strict(
    value,
    [
      'version',
      'projection',
      'position',
      'target',
      'up',
      'aspect',
      'near',
      'far',
      'halfHeight',
      'fovDeg',
    ],
    'camera',
  );
  if (value.version !== 'kiln.camera.v1') throw new Error('camera.version must be kiln.camera.v1');
  const camera = {
    ...value,
    position: triple(value.position, 'position'),
    target: triple(value.target, 'target'),
    up: triple(value.up, 'up'),
  };
  const view = vec(camera.target).sub(vec(camera.position));
  const up = vec(camera.up);
  if (view.length() < 1e-9) throw new Error('camera target must differ from position');
  if (up.length() < 1e-9 || view.clone().cross(up).length() <= view.length() * up.length() * 1e-9)
    throw new Error('camera up must be non-zero and not collinear with view');
  if (
    finite(camera.aspect, 'aspect') <= 0 ||
    finite(camera.near, 'near') <= 0 ||
    finite(camera.far, 'far') <= camera.near
  )
    throw new Error('camera requires positive aspect and 0 < near < far');
  if (camera.projection === 'orthographic') {
    if (
      !Number.isFinite(camera.halfHeight) ||
      camera.halfHeight! <= 0 ||
      camera.fovDeg !== undefined
    )
      throw new Error('orthographic camera requires positive halfHeight and no fovDeg');
  } else if (camera.projection === 'perspective') {
    if (
      !Number.isFinite(camera.fovDeg) ||
      camera.fovDeg! <= 0 ||
      camera.fovDeg! >= 180 ||
      camera.halfHeight !== undefined
    )
      throw new Error('perspective camera requires 0 < fovDeg < 180 and no halfHeight');
  } else throw new Error('unknown camera projection');
  return camera;
}
export function resolveAssetCamera(root: unknown, shot: CameraShotV1 = {}): ResolvedCameraShotV1 {
  strict(shot, ['name', 'subject', 'visibility', 'camera', 'hide'], 'shot');
  if (
    shot.hide !== undefined &&
    (!Array.isArray(shot.hide) ||
      shot.hide.length > 64 ||
      shot.hide.some((value) => typeof value !== 'string' || !value.length || value.length > 1024))
  )
    throw new Error(
      'shot.hide requires at most 64 exact paths or unambiguous names of 1..1024 characters',
    );
  const hide = shot.hide?.map(
    (value) =>
      selectCameraSubject(root, value.startsWith('/') ? { path: value } : { name: value }).path,
  );
  const rootNode = root as Object3D;
  rootNode.updateMatrixWorld(true);
  const selected = selectCameraSubject(root, shot.subject);
  const bounds = measureBounds(selected.node);
  if (!collectTriangles(selected.node).tris.length)
    throw new Error(`subject ${selected.path} has no visible geometry`);
  const request = shot.camera ?? { type: 'orbit' };
  let camera: ResolvedAssetCameraV1;
  if (request.type === 'orbit') {
    strict(request, ['type', 'azimuthDeg', 'elevationDeg', 'relativeTo', 'padding'], 'camera');
    const relative = request.relativeTo ?? 'world';
    if (!['world', 'asset', 'part'].includes(relative)) throw new Error('invalid relativeTo');
    const dir = vec(
      orbitDir(
        finite(request.azimuthDeg ?? 45, 'azimuthDeg'),
        finite(request.elevationDeg ?? 25, 'elevationDeg'),
      ),
    );
    let up: CameraVec3 | undefined;
    if (relative !== 'world') {
      const node = relative === 'part' ? selected.node : rootNode;
      dir.transformDirection(node.matrixWorld);
      up = tuple(new Vector3(0, 1, 0).transformDirection(node.matrixWorld));
    }
    camera = cameraFromBounds(bounds, tuple(dir), request.padding ?? 1.2, up, measureBounds(root));
  } else if (request.type === 'explicit') {
    strict(
      request,
      [
        'type',
        'projection',
        'position',
        'target',
        'up',
        'halfHeight',
        'fovDeg',
        'near',
        'far',
        'relativeTo',
        'frame',
        'framing',
        'padding',
        'targetOffset',
      ],
      'camera',
    );
    if (
      (request.projection === 'orthographic' && request.fovDeg !== undefined) ||
      (request.projection === 'perspective' && request.halfHeight !== undefined)
    )
      throw new Error('projection and lens fields conflict');
    const relative = request.relativeTo ?? 'world';
    if (!['world', 'asset', 'part', 'local'].includes(relative))
      throw new Error('invalid relativeTo');
    if ((relative === 'local') !== Boolean(request.frame))
      throw new Error('local coordinates require frame; frame is only valid for local coordinates');
    if (request.framing !== undefined && !['explicit', 'bounds'].includes(request.framing))
      throw new Error('invalid framing');
    if (request.target === undefined && request.framing !== 'bounds')
      throw new Error('explicit framing requires target');
    if (request.padding !== undefined && request.framing !== 'bounds')
      throw new Error('padding requires bounds framing');
    if (request.framing === 'bounds' && request.halfHeight !== undefined)
      throw new Error('bounds framing derives halfHeight');
    let matrix = new Matrix4();
    if (relative === 'asset' || relative === 'part')
      matrix = (relative === 'asset' ? rootNode : selected.node).matrixWorld;
    if (request.frame) {
      strict(request.frame, ['origin', 'rotation'], 'frame');
      const rotation = triple(request.frame.rotation ?? [0, 0, 0], 'frame.rotation');
      matrix.makeRotationFromEuler(
        new Euler(...(rotation.map((n) => (n * Math.PI) / 180) as CameraVec3), 'XYZ'),
      );
      matrix.setPosition(...triple(request.frame.origin ?? [0, 0, 0], 'frame.origin'));
    }
    const position = vec(triple(request.position, 'position')).applyMatrix4(matrix);
    const target = request.target
      ? vec(triple(request.target, 'target')).applyMatrix4(matrix)
      : vec(bounds.min).add(vec(bounds.max)).multiplyScalar(0.5);
    const up = vec(triple(request.up ?? [0, 1, 0], 'up')).transformDirection(matrix);
    const offset = vec(triple(request.targetOffset ?? [0, 0, 0], 'targetOffset'))
      .applyMatrix4(matrix)
      .sub(new Vector3().setFromMatrixPosition(matrix));
    const radius = vec(bounds.max).sub(vec(bounds.min)).length();
    camera = {
      version: 'kiln.camera.v1',
      projection: request.projection,
      position: tuple(position),
      target: tuple(target.clone().add(offset)),
      up: tuple(up),
      aspect: 1,
      near: request.near ?? 0.001,
      far: request.far ?? Math.max(100, position.distanceTo(target) + radius * 4),
      ...(request.projection === 'orthographic'
        ? { halfHeight: request.halfHeight ?? Math.max(radius / 2, 1e-6) }
        : { fovDeg: request.fovDeg ?? 50 }),
    };
    if (request.framing === 'bounds') {
      const direction = position.clone().sub(target);
      if (direction.lengthSq() < 1e-20)
        throw new Error('bounds framing position and target must differ');
      const padding = request.padding ?? 1.2;
      const fit = cameraFromBounds(
        bounds,
        tuple(direction),
        padding,
        tuple(up),
        measureBounds(root),
      );
      if (request.projection === 'orthographic')
        camera = { ...fit, near: request.near ?? fit.near, far: request.far ?? fit.far };
      else {
        const fov = finite(request.fovDeg ?? 50, 'fovDeg');
        if (fov <= 0 || fov >= 180) throw new Error('invalid fovDeg');
        const distance = (Math.max(radius / 2, 1e-6) * padding) / Math.sin((fov * Math.PI) / 360);
        const center = vec(fit.target);
        camera = {
          ...camera,
          position: tuple(center.clone().add(direction.normalize().multiplyScalar(distance))),
          target: tuple(center),
          far: request.far ?? Math.max(100, distance + radius * 4),
        };
      }
      camera.position = tuple(vec(camera.position).add(offset));
      camera.target = tuple(vec(camera.target).add(offset));
    }
    if (request.projection === 'perspective' && request.near === undefined)
      camera.near = defaultPerspectiveNear(rootNode, camera.position, camera.far);
  } else throw new Error('unknown camera type');
  if (shot.visibility !== undefined && !['context', 'isolate'].includes(shot.visibility))
    throw new Error('invalid visibility');
  return {
    name: shot.name ?? selected.name ?? 'VIEW',
    camera: validateResolvedAssetCamera(camera),
    subject: { path: selected.path, name: selected.name, bounds },
    visibility: shot.visibility ?? 'context',
    ...(hide?.length ? { hide: [...new Set(hide)] } : {}),
  };
}
/** Temporary per-mesh isolation restored even if rendering fails; never mutate stored artifacts. */
export async function withCameraVisibility<T>(
  root: unknown,
  shot: ResolvedCameraShotV1,
  run: () => Promise<T>,
): Promise<T> {
  if (shot.visibility === 'context' && !shot.hide?.length) return run();
  const keep = new Set<Object3D>();
  const subject = selectCameraSubject(root, { path: shot.subject.path }).node;
  subject.traverse((n) => keep.add(n));
  const restore: Array<[Object3D, boolean]> = [];
  // An isolated subject draws even when it, or an ancestor, is hidden (visible = false);
  // hidden parts inside it stay hidden.
  for (
    let node: Object3D | null = shot.visibility === 'isolate' ? subject : null;
    node;
    node = node.parent
  ) {
    if (node.visible === false) {
      restore.push([node, false]);
      node.visible = true;
    }
  }
  (root as Object3D).traverse((n) => {
    if (
      shot.visibility === 'isolate' &&
      (n as Object3D & { isMesh?: boolean }).isMesh &&
      !keep.has(n)
    ) {
      restore.push([n, n.visible]);
      n.visible = false;
    }
  });
  for (const path of shot.hide ?? []) {
    const node = selectCameraSubject(root, { path }).node;
    restore.push([node, node.visible]);
    node.visible = false;
  }
  try {
    return await run();
  } finally {
    for (const [node, visible] of restore.reverse()) node.visible = visible;
  }
}
/**
 * Remove hidden subtrees from a shot derivative so every renderer receives the same geometry.
 * A derivative GLB
 * serialized from a scene with hidden nodes (authored, or isolated by
 * {@link withCameraVisibility}) would ship them to the GPU. Every node with
 * `visible = false` leaves with its subtree, which is what three draws. Returns the root
 * itself when nothing is hidden, else a pruned clone; the caller's scene is never mutated and
 * restores `.visible` itself.
 */
export function withoutHiddenMeshes(root: Object3D): Object3D {
  if (root.visible === false) {
    // A mesh root may itself carry geometry; use a plain empty group for this derivative.
    const empty = new Group();
    empty.name = root.name;
    return empty;
  }
  const hidden = (node: Object3D) => node !== root && node.visible === false;
  let any = false;
  root.traverse((node) => {
    if (hidden(node)) any = true;
  });
  if (!any) return root;
  const copy = root.clone(true);
  const drop: Object3D[] = [];
  copy.traverse((node) => {
    if (hidden(node)) drop.push(node);
  });
  for (const node of drop) node.removeFromParent();
  return copy;
}
/** Flat geometry renderer with exact orthographic/perspective projection and near/far clipping. */
export function rasterizeCamera(
  root: unknown,
  input: ResolvedAssetCameraV1,
  size = 384,
  backfaceCull = true,
  backdrop?: BackdropId,
): Uint8Array {
  const camera = validateResolvedAssetCamera(input);
  const bg = resolveBackdrop(backdrop).rgb;
  if (!Number.isInteger(size) || size < 1 || size > 2048)
    throw new Error('camera size must be an integer in 1..2048');
  const z = vec(camera.position).sub(vec(camera.target)).normalize(),
    x = vec(camera.up).cross(z).normalize(),
    y = z.clone().cross(x),
    position = vec(camera.position);
  const out = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) out.set(bg, i * 3);
  const depth = new Float64Array(size * size).fill(Infinity);
  const clip = (points: Vector3[], plane: number, near: boolean) => {
    const result: Vector3[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!,
        b = points[(i + 1) % points.length]!;
      const insideA = near ? a.z >= plane : a.z <= plane,
        insideB = near ? b.z >= plane : b.z <= plane;
      if (insideA) result.push(a);
      if (insideA !== insideB) result.push(a.clone().lerp(b, (plane - a.z) / (b.z - a.z)));
    }
    return result;
  };
  const key = new Vector3(1.5, 2, 1).normalize();
  const srgb = (n: number) => (n <= 0.0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - 0.055);
  const ordered = compositingOrder(collectTriangles(root as Object3D).tris, (px, py, pz) =>
    camera.projection === 'perspective'
      ? Math.hypot(px - position.x, py - position.y, pz - position.z)
      : (position.x - px) * z.x + (position.y - py) * z.y + (position.z - pz) * z.z,
  );
  for (const tri of ordered) {
    const world = [0, 1, 2].map(
      (i) => new Vector3(tri.v[i * 3]!, tri.v[i * 3 + 1]!, tri.v[i * 3 + 2]!),
    );
    const normal = world[1]!
      .clone()
      .sub(world[0]!)
      .cross(world[2]!.clone().sub(world[0]!))
      .normalize();
    if (
      backfaceCull &&
      !tri.doubleSided &&
      normal.dot(camera.projection === 'perspective' ? position.clone().sub(world[0]!) : z) <= 0
    )
      continue;
    if (tri.alpha <= 0) continue;
    const light = Math.min(1, 0.25 + 1.1 * Math.max(0, normal.dot(key)));
    const color = tri.color.map((c) => Math.round(srgb(c * light) * 255));
    let polygon = world.map((p) => {
      const d = p.clone().sub(position);
      return new Vector3(d.dot(x), d.dot(y), -d.dot(z));
    });
    polygon = clip(clip(polygon, camera.near, true), camera.far, false);
    for (let t = 1; t < polygon.length - 1; t++) {
      const p = [polygon[0]!, polygon[t]!, polygon[t + 1]!];
      const screen = p.map((v) => {
        const half =
          camera.projection === 'orthographic'
            ? camera.halfHeight!
            : v.z * Math.tan((camera.fovDeg! * Math.PI) / 360);
        return [
          size / 2 + (v.x * size) / (2 * half * camera.aspect),
          size / 2 - (v.y * size) / (2 * half),
        ];
      });
      const [a, b, c] = screen as [number[], number[], number[]];
      const area = (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
      if (Math.abs(area) < 1e-9) continue;
      for (
        let py = Math.max(0, Math.floor(Math.min(...screen.map((s) => s[1]!))));
        py <= Math.min(size - 1, Math.ceil(Math.max(...screen.map((s) => s[1]!))));
        py++
      )
        for (
          let px = Math.max(0, Math.floor(Math.min(...screen.map((s) => s[0]!))));
          px <= Math.min(size - 1, Math.ceil(Math.max(...screen.map((s) => s[0]!))));
          px++
        ) {
          const w0 =
              ((b[0]! - a[0]!) * (py + 0.5 - a[1]!) - (b[1]! - a[1]!) * (px + 0.5 - a[0]!)) / area,
            w1 =
              ((c[0]! - b[0]!) * (py + 0.5 - b[1]!) - (c[1]! - b[1]!) * (px + 0.5 - b[0]!)) / area,
            w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const d =
            camera.projection === 'perspective'
              ? 1 / (w1 / p[0]!.z + w2 / p[1]!.z + w0 / p[2]!.z)
              : w1 * p[0]!.z + w2 * p[1]!.z + w0 * p[2]!.z;
          const index = py * size + px;
          if (d >= depth[index]!) continue;
          depth[index] = d;
          for (let channel = 0; channel < 3; channel++)
            out[index * 3 + channel] = Math.round(
              color[channel]! * tri.alpha + out[index * 3 + channel]! * (1 - tri.alpha),
            );
        }
    }
  }
  return out;
}
