/**
 * Delivery facts read from a written GLB alone (delivery contract item 1).
 *
 * Walks the default scene once, depth first, and lists every collider proxy, anchor, kit
 * module and port by its semantic role, with the inspection path `kiln_inspect` lists and the
 * node transform relative to the asset root. Lower `MSFT_lod` levels sit outside the scene
 * and are not reached. The diagnostics are advisory and never QA acceptance: a proxy that
 * draws, leaves the drawn bounds or touches no drawn triangle; a port outside its module's
 * footprint; an anchor with children.
 */
import type { Document, Node as GltfNode } from '@gltf-transform/core';
import type { InstancedMesh } from '@gltf-transform/extensions';
import * as THREE from 'three';
import type {
  DeliveryAnchorV1,
  DeliveryColliderV1,
  DeliveryDiagnosticV1,
  DeliveryKitModuleV1,
  DeliveryPortV1,
  DeliveryTransformV1,
} from './contracts/integration';
import { KILN_SEMANTIC_ROLES, readSemanticMetadataV1FromExtras } from './contracts/semantic';
import { KILN_KIT_KEY, kitModuleExtras } from './delivery';
import { isHiddenGltfNode } from './metrics';
import { drawnSceneBounds } from './node-visibility';

/** Upper bound on collider-triangle overlap tests before the check reports itself unmeasured. */
export const DELIVERY_OVERLAP_TEST_LIMIT = 50_000_000;

export interface DeliverySummary {
  colliders: DeliveryColliderV1[];
  anchors: DeliveryAnchorV1[];
  kit?: DeliveryKitModuleV1;
  ports: DeliveryPortV1[];
  diagnostics: DeliveryDiagnosticV1[];
}

interface Visited {
  node: GltfNode;
  path: string;
  roles: string[];
  hidden: boolean;
  /** Path of the nearest kit module at or above this node. */
  module?: { node: GltfNode; path: string };
}

const segment = (name: string, occurrence: number) => `/${encodeURIComponent(name)}[${occurrence}]`;

const roleTail = (role: string, base: string): string | undefined =>
  role.startsWith(`${base}.`) ? role.slice(base.length + 1) : undefined;

function decompose(matrix: THREE.Matrix4): DeliveryTransformV1 {
  const translation = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(translation, rotation, scale);
  const clean = (value: number) => (Object.is(value, -0) ? 0 : value);
  return {
    translation: translation.toArray().map(clean) as [number, number, number],
    rotation: rotation.toArray().map(clean) as [number, number, number, number],
    scale: scale.toArray().map(clean) as [number, number, number],
  };
}

const worldMatrix = (node: GltfNode) => new THREE.Matrix4().fromArray(node.getWorldMatrix());

/** World triangles of every drawn mesh outside collider proxies, instance copies included. */
function drawnTriangles(visited: readonly Visited[]): Float64Array {
  const values: number[] = [];
  const local = [0, 0, 0];
  const point = new THREE.Vector3();
  for (const { node, roles, hidden } of visited) {
    const mesh = node.getMesh();
    if (!mesh || hidden || roles.some((role) => role.startsWith('collider.'))) continue;
    const base = worldMatrix(node);
    const instances = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
    const translation = instances?.getAttribute('TRANSLATION');
    const rotation = instances?.getAttribute('ROTATION');
    const scale = instances?.getAttribute('SCALE');
    const copies = translation?.getCount() ?? rotation?.getCount() ?? scale?.getCount() ?? 1;
    const matrices: THREE.Matrix4[] = [];
    for (let i = 0; i < copies; i++) {
      const instance = new THREE.Matrix4().compose(
        new THREE.Vector3().fromArray(translation?.getElement(i, []) ?? [0, 0, 0]),
        new THREE.Quaternion().fromArray(rotation?.getElement(i, []) ?? [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(scale?.getElement(i, []) ?? [1, 1, 1]),
      );
      matrices.push(base.clone().multiply(instance));
    }
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) continue;
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const indices = primitive.getIndices();
      const count = indices ? indices.getCount() : position.getCount();
      for (const matrix of matrices)
        for (let i = 0; i + 2 < count; i += 3)
          for (let k = 0; k < 3; k++) {
            position.getElement(indices ? indices.getScalar(i + k) : i + k, local);
            point.fromArray(local).applyMatrix4(matrix);
            values.push(point.x, point.y, point.z);
          }
    }
  }
  return Float64Array.from(values);
}

/** Separating-axis test of a triangle against the box [-h, h] centred at the origin. */
function triangleOverlapsBox(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  h: THREE.Vector3,
  tolerance: number,
): boolean {
  const verts = [a, b, c];
  const he = [h.x + tolerance, h.y + tolerance, h.z + tolerance];
  for (let axis = 0; axis < 3; axis++) {
    const values = verts.map((v) => v.getComponent(axis));
    if (Math.min(...values) > he[axis]! || Math.max(...values) < -he[axis]!) return false;
  }
  const e = [
    new THREE.Vector3().subVectors(b, a),
    new THREE.Vector3().subVectors(c, b),
    new THREE.Vector3().subVectors(a, c),
  ];
  const normal = new THREE.Vector3().crossVectors(e[0]!, e[1]!);
  const axes: THREE.Vector3[] = [normal];
  const units = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  for (const unit of units)
    for (const edge of e) axes.push(new THREE.Vector3().crossVectors(unit, edge));
  for (const axis of axes) {
    if (axis.lengthSq() < 1e-24) continue;
    const projections = verts.map((v) => v.dot(axis));
    const radius =
      he[0]! * Math.abs(axis.x) + he[1]! * Math.abs(axis.y) + he[2]! * Math.abs(axis.z);
    if (Math.min(...projections) > radius || Math.max(...projections) < -radius) return false;
  }
  return true;
}

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5). */
function closestPointOnTriangle(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const ap = new THREE.Vector3().subVectors(p, a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return a.clone();
  const bp = new THREE.Vector3().subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return b.clone();
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return a.clone().addScaledVector(ab, d1 / (d1 - d3));
  const cp = new THREE.Vector3().subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return c.clone();
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return a.clone().addScaledVector(ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return b
      .clone()
      .addScaledVector(new THREE.Vector3().subVectors(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  const denominator = 1 / (va + vb + vc);
  return a
    .clone()
    .addScaledVector(ab, vb * denominator)
    .addScaledVector(ac, vc * denominator);
}

/** Squared distance between segments p1q1 and p2q2 (Ericson 5.1.9). */
function segmentSegmentDistanceSq(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
): number {
  const d1 = new THREE.Vector3().subVectors(q1, p1);
  const d2 = new THREE.Vector3().subVectors(q2, p2);
  const r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s = 0;
  let t = 0;
  if (a <= 1e-24 && e <= 1e-24) return r.lengthSq();
  if (a <= 1e-24) t = THREE.MathUtils.clamp(f / e, 0, 1);
  else {
    const c = d1.dot(r);
    if (e <= 1e-24) s = THREE.MathUtils.clamp(-c / a, 0, 1);
    else {
      const b = d1.dot(d2);
      const denominator = a * e - b * b;
      s = denominator !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / denominator, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s);
  const c2 = p2.clone().addScaledVector(d2, t);
  return c1.distanceToSquared(c2);
}

/** Whether segment pq passes through triangle abc. */
function segmentCrossesTriangle(
  p: THREE.Vector3,
  q: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): boolean {
  const hit = new THREE.Vector3();
  const ray = new THREE.Ray(p, new THREE.Vector3().subVectors(q, p));
  const length = ray.direction.length();
  if (length === 0) return false;
  ray.direction.divideScalar(length);
  return ray.intersectTriangle(a, b, c, false, hit) !== null && hit.distanceTo(p) <= length;
}

/** Whether triangle abc comes within `radius` of segment pq. */
function triangleTouchesCapsule(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  p: THREE.Vector3,
  q: THREE.Vector3,
  radius: number,
): boolean {
  const r2 = radius * radius;
  if (closestPointOnTriangle(p, a, b, c).distanceToSquared(p) <= r2) return true;
  if (closestPointOnTriangle(q, a, b, c).distanceToSquared(q) <= r2) return true;
  for (const [s, e] of [
    [a, b],
    [b, c],
    [c, a],
  ] as const)
    if (segmentSegmentDistanceSq(p, q, s, e) <= r2) return true;
  return segmentCrossesTriangle(p, q, a, b, c);
}

/** Every delivery record and advisory finding in the default scene of `doc`. */
export function inspectDelivery(doc: Document): DeliverySummary {
  const summary: DeliverySummary = { colliders: [], anchors: [], ports: [], diagnostics: [] };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return summary;
  const visited: Visited[] = [];
  const visit = (
    siblings: readonly GltfNode[],
    parentPath: string,
    hidden: boolean,
    module: Visited['module'],
  ): void => {
    const seen = new Map<string, number>();
    for (const node of siblings) {
      const name = node.getName();
      const occurrence = seen.get(name) ?? 0;
      seen.set(name, occurrence + 1);
      const path = `${parentPath}${segment(name, occurrence)}`;
      const roles = readSemanticMetadataV1FromExtras(node.getExtras())?.roles ?? [];
      const nodeHidden = hidden || isHiddenGltfNode(node);
      const nodeModule = roles.includes(KILN_SEMANTIC_ROLES.kitModule) ? { node, path } : module;
      visited.push({ node, path, roles, hidden: nodeHidden, module: nodeModule });
      visit(node.listChildren(), path, nodeHidden, nodeModule);
    }
  };
  visit(scene.listChildren(), segment(scene.getName() || 'Scene', 0), false, undefined);
  const finding = (code: string, path: string, message: string) =>
    summary.diagnostics.push({ code, path, message });

  // Drawn bounds, the same measure the manifest headline uses.
  const { min, max } = drawnSceneBounds(scene);
  const bounds = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
  const finiteBounds = [...min, ...max].every(Number.isFinite);
  const diagonal = finiteBounds ? bounds.getSize(new THREE.Vector3()).length() : 0;
  const tolerance = Math.max(1e-4, diagonal * 1e-4);

  const colliderNodes: Array<{ visit: Visited; record: DeliveryColliderV1 }> = [];
  for (const entry of visited) {
    const { node, path, roles } = entry;
    for (const role of roles) {
      const matrix = worldMatrix(node);
      const transform = decompose(matrix);
      for (const shape of ['box', 'capsule', 'hull'] as const) {
        const id = roleTail(role, `${KILN_SEMANTIC_ROLES.collider}.${shape}`);
        if (id === undefined) continue;
        const scale = transform.scale;
        const record: DeliveryColliderV1 = {
          role,
          id,
          path,
          name: node.getName(),
          transform,
          shape:
            shape === 'box'
              ? { kind: 'box', size: [...scale] }
              : shape === 'capsule'
                ? { kind: 'capsule', radius: scale[0] / 2, height: scale[1] }
                : {
                    kind: 'hull',
                    vertices:
                      node
                        .getMesh()
                        ?.listPrimitives()
                        .reduce(
                          (sum, primitive) =>
                            sum + (primitive.getAttribute('POSITION')?.getCount() ?? 0),
                          0,
                        ) ?? 0,
                  },
        };
        summary.colliders.push(record);
        colliderNodes.push({ visit: entry, record });
      }
      const anchorTail = roleTail(role, KILN_SEMANTIC_ROLES.anchor);
      if (anchorTail !== undefined) {
        const [kind, ...rest] = anchorTail.split('.');
        summary.anchors.push({
          role,
          kind: kind!,
          id: rest.join('.'),
          path,
          name: node.getName(),
          transform,
        });
      }
      const portId = roleTail(role, KILN_SEMANTIC_ROLES.kitPort);
      if (portId !== undefined)
        summary.ports.push({
          role,
          id: portId,
          path,
          name: node.getName(),
          ...(entry.module && entry.module.node !== node ? { module: entry.module.path } : {}),
          transform,
        });
      if (role === KILN_SEMANTIC_ROLES.kitModule) {
        const extras = (node.getExtras() as Record<string, unknown>)[KILN_KIT_KEY];
        let spec: ReturnType<typeof kitModuleExtras> | undefined;
        try {
          const { schemaVersion, ...rest } = (extras ?? {}) as Record<string, unknown>;
          spec = schemaVersion === 1 ? kitModuleExtras(rest) : undefined;
        } catch {
          spec = undefined;
        }
        if (!spec)
          finding(
            'DELIVERY_KIT_INVALID',
            path,
            `kit module has no valid ${KILN_KIT_KEY} extras; mark it with defineModule.`,
          );
        else if (summary.kit)
          finding(
            'DELIVERY_KIT_MULTIPLE',
            path,
            `a GLB delivers one kit module; ${summary.kit.path} is listed and this one is not.`,
          );
        else
          summary.kit = {
            role,
            path,
            name: node.getName(),
            footprint: spec.footprint,
            height: spec.height,
            snapAxis: spec.snapAxis,
            origin: spec.origin,
            transform,
          };
      }
    }
  }

  // Collider findings, in scene order.
  const triangles = colliderNodes.some(({ record }) => record.shape.kind !== 'hull')
    ? drawnTriangles(visited)
    : new Float64Array();
  const triangleCount = triangles.length / 9;
  let overlapTests = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const { visit: entry, record } of colliderNodes) {
    if (!entry.hidden)
      finding(
        'DELIVERY_COLLIDER_NOT_HIDDEN',
        record.path,
        'collider proxy draws; hide it (the delivery helpers do) so importers that ignore roles draw only the asset.',
      );
    const matrix = worldMatrix(entry.node);
    const proxyBounds = new THREE.Box3();
    const mesh = entry.node.getMesh();
    const local = [0, 0, 0];
    for (const primitive of mesh?.listPrimitives() ?? []) {
      const position = primitive.getAttribute('POSITION');
      for (let i = 0; i < (position?.getCount() ?? 0); i++)
        proxyBounds.expandByPoint(
          new THREE.Vector3().fromArray(position!.getElement(i, local)).applyMatrix4(matrix),
        );
    }
    if (proxyBounds.isEmpty())
      proxyBounds.expandByPoint(new THREE.Vector3().setFromMatrixPosition(matrix));
    const expanded = bounds.clone().expandByScalar(tolerance);
    if (!finiteBounds || !expanded.containsBox(proxyBounds))
      finding(
        'DELIVERY_COLLIDER_OUTSIDE_BOUNDS',
        record.path,
        'collider proxy reaches outside the bounds of the drawn asset.',
      );
    if (record.shape.kind === 'hull') continue;
    if (overlapTests + triangleCount > DELIVERY_OVERLAP_TEST_LIMIT) {
      finding(
        'DELIVERY_COLLIDER_OVERLAP_UNMEASURED',
        record.path,
        `overlap with drawn triangles was not measured: the check stops at ${DELIVERY_OVERLAP_TEST_LIMIT} collider-triangle tests.`,
      );
      continue;
    }
    overlapTests += triangleCount;
    const toLocal = new THREE.Matrix4();
    let touches = false;
    if (record.shape.kind === 'box') {
      // Unit box space: the inverse world matrix maps the box onto [-0.5, 0.5]^3.
      toLocal.copy(matrix).invert();
      const half = new THREE.Vector3(0.5, 0.5, 0.5);
      const scale = Math.max(...record.transform.scale.map(Math.abs), 1e-9);
      for (let t = 0; t < triangleCount && !touches; t++) {
        a.fromArray(triangles, t * 9).applyMatrix4(toLocal);
        b.fromArray(triangles, t * 9 + 3).applyMatrix4(toLocal);
        c.fromArray(triangles, t * 9 + 6).applyMatrix4(toLocal);
        touches = triangleOverlapsBox(a, b, c, half, tolerance / scale);
      }
    } else {
      // Rigid capsule frame: translation and rotation only, so the radius stays metric.
      const { translation, rotation } = record.transform;
      toLocal
        .compose(
          new THREE.Vector3(...translation),
          new THREE.Quaternion(...rotation),
          new THREE.Vector3(1, 1, 1),
        )
        .invert();
      const { radius, height } = record.shape;
      const p = new THREE.Vector3(0, -height / 2 + radius, 0);
      const q = new THREE.Vector3(0, height / 2 - radius, 0);
      for (let t = 0; t < triangleCount && !touches; t++) {
        a.fromArray(triangles, t * 9).applyMatrix4(toLocal);
        b.fromArray(triangles, t * 9 + 3).applyMatrix4(toLocal);
        c.fromArray(triangles, t * 9 + 6).applyMatrix4(toLocal);
        touches = triangleTouchesCapsule(a, b, c, p, q, radius + tolerance);
      }
    }
    if (!touches)
      finding(
        'DELIVERY_COLLIDER_NO_OVERLAP',
        record.path,
        'collider proxy overlaps no drawn triangle; a box or capsule normally wraps or crosses the surface it stands for.',
      );
  }

  // Port findings: each port must lie in its module's footprint.
  for (const record of summary.ports) {
    const entry = visited.find((item) => item.path === record.path)!;
    const moduleEntry = entry.module && entry.module.node !== entry.node ? entry.module : undefined;
    const spec = moduleEntry && summary.kit?.path === moduleEntry.path ? summary.kit : undefined;
    if (!spec) {
      finding(
        'DELIVERY_PORT_WITHOUT_MODULE',
        record.path,
        'port is not under a valid kit module; place ports under the root defineModule marked.',
      );
      continue;
    }
    const point = new THREE.Vector3(...record.transform.translation).applyMatrix4(
      worldMatrix(moduleEntry!.node).invert(),
    );
    const [width, depth] = spec.footprint;
    const [x0, x1, z0, z1] =
      spec.origin === 'corner'
        ? [0, width, 0, depth]
        : [-width / 2, width / 2, -depth / 2, depth / 2];
    const slack = Math.max(1e-4, Math.max(width, depth, spec.height) * 1e-5);
    if (
      point.x < x0 - slack ||
      point.x > x1 + slack ||
      point.z < z0 - slack ||
      point.z > z1 + slack ||
      point.y < -slack ||
      point.y > spec.height + slack
    )
      finding(
        'DELIVERY_PORT_OUTSIDE_FOOTPRINT',
        record.path,
        `port lies outside its module footprint (${width} x ${depth} m from the ${spec.origin}, 0..${spec.height} m high).`,
      );
  }

  // Anchor findings: an anchor is a point, so it has no children.
  for (const record of summary.anchors) {
    const entry = visited.find((item) => item.path === record.path)!;
    if (entry.node.listChildren().length > 0)
      finding(
        'DELIVERY_ANCHOR_NOT_LEAF',
        record.path,
        'anchor has children; an anchor is an empty leaf node, so attach parts beside it instead.',
      );
  }
  return summary;
}
