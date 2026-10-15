/**
 * Game-delivery authoring helpers (delivery contract item 1).
 *
 * Everything here is plain glTF a consumer can read without Kiln: semantic roles in node
 * extras (`kilnSemantic`), hidden proxy nodes through `KHR_node_visibility`, and one
 * engine-owned extras record (`kilnKit`) on a kit module root. Kiln teaches nothing about
 * physics or collision response; a collider is a shape and a transform, and the consumer
 * decides what to do with it.
 *
 * - `colliderBox(size, { id })` - a hidden unit box (-0.5..0.5); the node scale is the size.
 * - `colliderCapsule(radius, height, { id })` - a hidden unit capsule (radius 0.5, height 1
 *   along +Y); the node scale is [2 * radius, height, 2 * radius]. `height` is the total
 *   end-to-end height, caps included.
 * - `colliderHull(mesh, { id })` - a hidden convex hull of the mesh's vertices beside it.
 * - `anchor(kind, id)` - a hidden empty leaf: doors, plates, beacons, hardpoints, lights.
 * - `defineModule(root, spec)` - marks a kit module root and records its footprint.
 * - `port(id)` - an empty snap point under a kit module.
 *
 * Proxies and anchors are hidden through the existing hidden-node mechanism, so an importer
 * that ignores roles still draws exactly the asset. Ids and kinds are single role segments.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import {
  KILN_SEMANTIC_ROLES,
  readSemanticMetadataV1,
  semanticRole,
  stampSemanticMetadataV1,
  type KitModuleSpecV1,
  type SemanticMetadataV1,
} from './contracts';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';
import { GEOMETRY_ALLOCATION_LIMITS } from './geometry-budget';

export type { KitModuleSpecV1 } from './contracts';

/** The engine-owned userData and node extras key a kit module root carries. */
export const KILN_KIT_KEY = 'kilnKit';
/** Name of the shared proxy material; proxies are hidden, so its colour never draws. */
export const COLLIDER_PROXY_MATERIAL_NAME = 'KilnColliderProxy';
/** Engine-owned key `repeatInstances` writes; exported as node extras of the same name. */
export const KILN_REPEAT_INSTANCES_KEY = 'kilnRepeatInstances';

export interface KitModuleExtrasV1 extends KitModuleSpecV1 {
  schemaVersion: 1;
}

export interface DeliveryPlacementOptions {
  parent?: THREE.Object3D;
  position?: [number, number, number];
  /** Degrees, XYZ order, as in createPart. */
  rotation?: [number, number, number];
}

export interface ColliderOptions extends DeliveryPlacementOptions {
  id: string;
}

export interface ColliderHullOptions {
  id: string;
  /** Defaults to the mesh's parent; the hull takes the mesh's local transform. */
  parent?: THREE.Object3D;
}

/** One role segment: letters, digits, `_` and `-`, starting with a letter or digit. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function fail(helper: string, detail: string): never {
  throw new AuthoringDiagnosticError('DELIVERY_CONTRACT', `${helper}: ${detail}`);
}

function segment(helper: string, label: string, value: unknown): string {
  if (typeof value !== 'string' || !SEGMENT.test(value))
    fail(
      helper,
      `${label} must be 1 to 64 letters, digits, "_" or "-" starting with a letter or digit (no dots), got ${JSON.stringify(value)}.`,
    );
  return value as string;
}

function finitePositive(helper: string, label: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0))
    fail(helper, `${label} must be a positive finite number of metres, got ${String(value)}.`);
  return value as number;
}

function triple(helper: string, label: string, value: unknown): [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
    fail(helper, `${label} must be three finite numbers.`);
  return [value[0], value[1], value[2]] as [number, number, number];
}

function isObject3D(value: unknown): value is THREE.Object3D {
  return (value as { isObject3D?: boolean } | null)?.isObject3D === true;
}

function place(helper: string, node: THREE.Object3D, options: DeliveryPlacementOptions): void {
  if (options.position !== undefined)
    node.position.set(...triple(helper, 'position', options.position));
  if (options.rotation !== undefined) {
    const [x, y, z] = triple(helper, 'rotation', options.rotation);
    node.rotation.set(
      THREE.MathUtils.degToRad(x),
      THREE.MathUtils.degToRad(y),
      THREE.MathUtils.degToRad(z),
    );
  }
  if (options.parent !== undefined) {
    if (!isObject3D(options.parent)) fail(helper, 'parent must be a scene node.');
    options.parent.add(node);
  }
}

function options<T extends object>(helper: string, value: unknown): T {
  if (value === undefined) return {} as T;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(helper, 'options must be an object.');
  return value as T;
}

/**
 * Add roles to a node's semantic metadata, keeping what is already there. A node without
 * metadata gets a fresh payload; duplicate roles are not repeated.
 */
export function addSemanticRoles(node: THREE.Object3D, roles: readonly string[]): void {
  const existing: SemanticMetadataV1 | undefined = readSemanticMetadataV1(node);
  const merged = [...(existing?.roles ?? [])];
  for (const role of roles) if (!merged.includes(role)) merged.push(role);
  stampSemanticMetadataV1(node, {
    roles: merged,
    relationships: existing?.relationships ?? [],
    frames: existing?.frames ?? [],
    sockets: existing?.sockets ?? [],
  });
}

function proxyMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ name: COLLIDER_PROXY_MATERIAL_NAME, color: 0xff00ff });
}

function proxy(
  shape: 'box' | 'capsule' | 'hull',
  id: string,
  geometry: THREE.BufferGeometry,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, proxyMaterial());
  mesh.name = `Collider_${shape}_${id}`;
  mesh.visible = false;
  addSemanticRoles(mesh, [
    semanticRole(
      shape === 'box'
        ? KILN_SEMANTIC_ROLES.colliderBox
        : shape === 'capsule'
          ? KILN_SEMANTIC_ROLES.colliderCapsule
          : KILN_SEMANTIC_ROLES.colliderHull,
      id,
    ),
  ]);
  return mesh;
}

/**
 * A hidden oriented-box collider. `size` is [width X, height Y, depth Z] in metres, or one
 * number for a cube. The proxy is a unit box under the node, whose scale is the size, so a
 * consumer reads the box from the transform alone: translation is the centre, rotation the
 * orientation (yaw for a yaw-only collider) and scale the size.
 */
export function colliderBox(
  size: number | [number, number, number],
  opts: ColliderOptions,
): THREE.Mesh {
  const helper = 'colliderBox(size, { id })';
  const settings = options<ColliderOptions>(helper, opts);
  const id = segment(helper, 'id', settings.id);
  const dims =
    typeof size === 'number'
      ? [size, size, size]
      : triple(helper, 'size', size).map((value) => value);
  for (const [index, value] of dims.entries())
    finitePositive(helper, `size[${index}]`, value as number);
  const mesh = proxy('box', id, new THREE.BoxGeometry(1, 1, 1));
  mesh.scale.set(dims[0]!, dims[1]!, dims[2]!);
  place(helper, mesh, settings);
  return mesh;
}

/**
 * A hidden capsule collider along the node's local +Y. `height` is the total end-to-end
 * height including both caps (unlike capsuleGeo, whose length is the straight middle), so
 * height must be at least 2 * radius. The proxy is a unit capsule (radius 0.5, height 1)
 * whose node scale is [2 * radius, height, 2 * radius].
 */
export function colliderCapsule(radius: number, height: number, opts: ColliderOptions): THREE.Mesh {
  const helper = 'colliderCapsule(radius, height, { id })';
  const settings = options<ColliderOptions>(helper, opts);
  const id = segment(helper, 'id', settings.id);
  finitePositive(helper, 'radius', radius);
  finitePositive(helper, 'height', height);
  if (height < 2 * radius)
    fail(
      helper,
      `height is the total height including both caps and must be at least 2 * radius (${2 * radius}), got ${height}.`,
    );
  // Build the true shape, then normalise it into the unit box so the node scale restores it.
  const geometry = new THREE.CapsuleGeometry(radius, height - 2 * radius, 4, 12);
  geometry.scale(1 / (2 * radius), 1 / height, 1 / (2 * radius));
  const mesh = proxy('capsule', id, geometry);
  mesh.scale.set(2 * radius, height, 2 * radius);
  place(helper, mesh, settings);
  return mesh;
}

/**
 * A hidden convex-hull collider of `mesh`'s vertices. The hull is built in the mesh's own
 * geometry space and takes the mesh's local transform, under the mesh's parent unless
 * `parent` is given. The input mesh is not changed.
 */
export function colliderHull(mesh: THREE.Object3D, opts: ColliderHullOptions): THREE.Mesh {
  const helper = 'colliderHull(mesh, { id })';
  const settings = options<ColliderHullOptions>(helper, opts);
  const id = segment(helper, 'id', settings.id);
  const source = mesh as THREE.Mesh;
  const position = source?.isMesh ? source.geometry?.getAttribute('position') : undefined;
  if (position?.itemSize !== 3)
    fail(helper, 'mesh must be a mesh with xyz positions, such as createPart returned.');
  if (position!.count > GEOMETRY_ALLOCATION_LIMITS.colliderHullVertices)
    fail(
      helper,
      `mesh has ${position!.count} vertices; a hull proxy reads at most ${GEOMETRY_ALLOCATION_LIMITS.colliderHullVertices}.`,
    );
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < position!.count; i++)
    points.push(new THREE.Vector3().fromBufferAttribute(position!, i));
  let geometry: THREE.BufferGeometry;
  try {
    geometry = new ConvexGeometry(points);
  } catch {
    fail(helper, 'the mesh vertices do not span a volume, so they have no convex hull.');
  }
  if (!geometry!.getAttribute('position')?.count)
    fail(helper, 'the mesh vertices do not span a volume, so they have no convex hull.');
  const hull = proxy('hull', id, geometry!);
  hull.position.copy(source.position);
  hull.quaternion.copy(source.quaternion);
  hull.scale.copy(source.scale);
  const parent = settings.parent ?? source.parent;
  if (parent !== undefined && parent !== null) {
    if (!isObject3D(parent)) fail(helper, 'parent must be a scene node.');
    parent.add(hull);
  }
  return hull;
}

/**
 * A named point with a transform, as a hidden empty leaf node named `Anchor_<kind>_<id>`
 * with role `anchor.<kind>.<id>`: a door, vault plate, beacon, hardpoint, light or spawn.
 */
export function anchor(kind: string, id: string, opts?: DeliveryPlacementOptions): THREE.Object3D {
  const helper = 'anchor(kind, id, opts?)';
  const settings = options<DeliveryPlacementOptions>(helper, opts);
  const kindSegment = segment(helper, 'kind', kind);
  const idSegment = segment(helper, 'id', id);
  const node = new THREE.Object3D();
  node.name = `Anchor_${kindSegment}_${idSegment}`;
  node.visible = false;
  addSemanticRoles(node, [semanticRole(KILN_SEMANTIC_ROLES.anchor, kindSegment, idSegment)]);
  place(helper, node, settings);
  return node;
}

/** Validate a kit module spec into its detached extras record. */
export function kitModuleExtras(
  spec: unknown,
  helper = 'defineModule(root, spec)',
): KitModuleExtrasV1 {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec))
    fail(helper, 'spec must be { footprint: [w, d], height, snapAxis, origin }.');
  const value = spec as Record<string, unknown>;
  const footprint = value.footprint;
  if (!Array.isArray(footprint) || footprint.length !== 2)
    fail(helper, 'footprint must be [width along X, depth along Z] in metres.');
  const [width, depth] = (footprint as unknown[]).map((item, index) =>
    finitePositive(helper, `footprint[${index}]`, item),
  ) as [number, number];
  const height = finitePositive(helper, 'height', value.height);
  if (value.snapAxis !== 'x' && value.snapAxis !== 'y' && value.snapAxis !== 'z')
    fail(helper, `snapAxis must be 'x', 'y' or 'z', got ${JSON.stringify(value.snapAxis)}.`);
  if (value.origin !== 'corner' && value.origin !== 'center')
    fail(helper, `origin must be 'corner' or 'center', got ${JSON.stringify(value.origin)}.`);
  for (const key of Object.keys(value))
    if (!['footprint', 'height', 'snapAxis', 'origin'].includes(key))
      fail(helper, `unknown spec field ${JSON.stringify(key)}.`);
  return {
    schemaVersion: 1,
    footprint: [width, depth],
    height,
    snapAxis: value.snapAxis as KitModuleSpecV1['snapAxis'],
    origin: value.origin as KitModuleSpecV1['origin'],
  };
}

/**
 * Mark `root` as the root of one modular kit piece. The footprint is width along X and depth
 * along Z from the module origin (`corner`: 0..w, 0..d; `center`: -w/2..w/2, -d/2..d/2), and
 * height runs 0..height along Y. Ports placed under the root are its snap points.
 */
export function defineModule<T extends THREE.Object3D>(root: T, spec: KitModuleSpecV1): T {
  const helper = 'defineModule(root, spec)';
  if (!isObject3D(root)) fail(helper, 'root must be a scene node, such as createRoot returned.');
  const extras = kitModuleExtras(spec, helper);
  root.userData[KILN_KIT_KEY] = extras;
  addSemanticRoles(root, [KILN_SEMANTIC_ROLES.kitModule]);
  return root;
}

/** An empty snap point named `Port_<id>` with role `kit.port.<id>`, placed in its parent. */
export function port(id: string, opts?: DeliveryPlacementOptions): THREE.Object3D {
  const helper = 'port(id, opts?)';
  const settings = options<DeliveryPlacementOptions>(helper, opts);
  const idSegment = segment(helper, 'id', id);
  const node = new THREE.Object3D();
  node.name = `Port_${idSegment}`;
  addSemanticRoles(node, [semanticRole(KILN_SEMANTIC_ROLES.kitPort, idSegment)]);
  place(helper, node, settings);
  return node;
}

/**
 * Mark `parent` so the three.js runtime target batches its identical children (same mesh
 * content and material, no children, roles or extras of their own) into one
 * `EXT_mesh_gpu_instancing` node. The editable GLB keeps every child as authored.
 */
export function repeatInstances<T extends THREE.Object3D>(parent: T): T {
  if (!isObject3D(parent))
    fail('repeatInstances(parent)', 'parent must be a scene node, such as a group of repeats.');
  parent.userData[KILN_REPEAT_INSTANCES_KEY] = { schemaVersion: 1 };
  return parent;
}

/** The extras a repeatInstances mark exports, or nothing. */
export function repeatInstancesExtras(node: unknown): Record<string, { schemaVersion: 1 }> {
  const target = node as { name?: string; userData?: Record<string, unknown> } | null;
  const value = target?.userData?.[KILN_REPEAT_INSTANCES_KEY];
  if (value === undefined) return {};
  if (
    !value ||
    typeof value !== 'object' ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    Object.keys(value).length !== 1
  )
    fail(
      'repeatInstances(parent)',
      `userData.${KILN_REPEAT_INSTANCES_KEY} on ${JSON.stringify(target?.name || '(unnamed node)')} is not a mark repeatInstances wrote; set it only through repeatInstances.`,
    );
  return { [KILN_REPEAT_INSTANCES_KEY]: { schemaVersion: 1 } };
}

/**
 * The extras a node's own kit record exports: a detached, validated copy, or nothing. A value
 * under the key that defineModule did not write fails the build rather than export.
 */
export function kitExtras(node: unknown): Record<string, KitModuleExtrasV1> {
  const target = node as { name?: string; userData?: Record<string, unknown> } | null;
  const value = target?.userData?.[KILN_KIT_KEY];
  if (value === undefined) return {};
  const record = value as Record<string, unknown>;
  if (!record || typeof record !== 'object' || record.schemaVersion !== 1)
    fail(
      'defineModule(root, spec)',
      `userData.${KILN_KIT_KEY} on ${JSON.stringify(target?.name || '(unnamed node)')} is not a record defineModule wrote; set it only through defineModule.`,
    );
  const { schemaVersion: _version, ...spec } = record;
  return { [KILN_KIT_KEY]: kitModuleExtras(spec) };
}
