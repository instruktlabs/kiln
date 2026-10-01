// SPDX-License-Identifier: MIT
// The campus ground and dressing in the scene (FF-C1 item 3), all from data/campus.json through roads.ts, in plain
// untextured palette materials (no textures, text, numbers, logos or brands):
//   ground     the grade plane, the paved surfaces (split road, cross pass, bays, plazas, parking aisles), the ring and
//              the markings. They lie on one plane, so they draw first, in their data order, with no depth test or write:
//              nothing z-fights at campus distances and everything above grade draws over them. The grade disc follows
//              the camera and reaches just inside the far plane (it is one flat colour, so moving it is invisible).
//   parking    the occupied stalls' cars as instanced two-box volumes (one draw), a tier share of them;
//   satellites the utility blocks and their roof units (two instanced draws);
//   lights     the light standards (pole and arm, one instanced draw) and their lamp heads (one instanced draw).
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three/webgpu';
import type { Camera } from 'three/webgpu';
import type { CampusData, CampusTier } from '../data';
import { groundLayers, hash01, hexToLinear, lampHeads, MeshBuilder, parkingStalls, satelliteBoxes } from '../roads';
import type { MeshArrays } from '../roads';
import type { DrivingData } from '../drive/driving';
import { createMarkingMaterial, markingAcross } from './markings';

/** Position and normal of several geometries merged into one (each moved by its matrix), for simple instanced volumes. */
export function mergeSimple(parts: readonly { geometry: BufferGeometry; matrix?: Matrix4 }[]): BufferGeometry {
  const positions: number[] = [], normals: number[] = [], index: number[] = [];
  const p = new Vector3(), n = new Vector3();
  for (const { geometry, matrix } of parts) {
    const pos = geometry.attributes.position!, nor = geometry.attributes.normal!, base = positions.length / 3;
    const normalMatrix = matrix ? new Matrix4().copy(matrix).invert().transpose() : null;
    for (let k = 0; k < pos.count; k++) {
      p.fromBufferAttribute(pos, k); n.fromBufferAttribute(nor, k);
      if (matrix) { p.applyMatrix4(matrix); n.applyMatrix4(normalMatrix!).normalize(); }
      positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z);
    }
    const src = geometry.index;
    for (let k = 0; k < (src ? src.count : pos.count); k++) index.push(base + (src ? src.getX(k) : k));
    geometry.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  out.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  out.setIndex(index);
  out.computeBoundingSphere();
  return out;
}

function groundGeometry(mesh: MeshArrays): BufferGeometry {
  const g = new BufferGeometry(), count = mesh.positions.length / 3, normals = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) normals[k * 3 + 1] = 1;
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('color', new BufferAttribute(mesh.colors, 3));
  g.setIndex(new BufferAttribute(mesh.indices, 1));
  g.computeBoundingSphere();
  return g;
}

export interface GroundStats { groundTriangles: number; parkedCars: number; satellites: number; lightStandards: number; lampHeads: number; instances: number }
export interface CampusGround {
  root: Group;
  /** The grade disc follows the camera and fills the view to just inside the far plane. */
  update(camera: Camera & { far: number }): void;
  /** Lamp heads' emissive level (0 by day). */
  setLamps(level: number): void;
  stats(): GroundStats;
  dispose(): void;
}

export function buildCampusGround(data: CampusData, tier: CampusTier, driving?:DrivingData): CampusGround {
  const root = new Group();
  root.name = 'campus-ground';
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // Ground layers draw in data order before the scene without depth test/write. Only markings
  // use a separate opaque material to filter subpixel paint contrast at campus distances.
  const groundMaterial = own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  groundMaterial.name = 'campus-ground';
  groundMaterial.depthTest = false; groundMaterial.depthWrite = false;
  const markingMaterial = own(createMarkingMaterial(data.roads));
  let grade: Mesh | null = null, gradeRadius = 1, groundTriangles = 0;
  for (const layer of groundLayers(data.roads, data.parking)) {
    const geometry = own(groundGeometry(layer.mesh));
    if (layer.name === 'markings') geometry.setAttribute('markAcross', markingAcross(geometry.attributes.position!.count));
    const mesh = new Mesh(geometry, layer.name === 'markings' ? markingMaterial : groundMaterial);
    mesh.name = `ground-${layer.name}`;
    mesh.renderOrder = layer.order;
    groundTriangles += layer.mesh.triangles;
    if (layer.name === 'grade') { grade = mesh; gradeRadius = data.roads.gradeRadius; mesh.frustumCulled = false; }
    root.add(mesh);
  }
  if(driving?.freightParking?.length){
    const builder=new MeshBuilder(data.roads.gradeY).tag('freight-aprons'),colour=hexToLinear(data.roads.palette.apron);
    for(const row of driving.freightParking){
      const c=Math.cos(row.heading),s=Math.sin(row.heading),point=(x:number,z:number):[number,number]=>[row.x+x*c-z*s,row.z+x*s+z*c];
      const [length,width]=row.apron;
      builder.quad(point(-length/2,-width/2),point(length/2,-width/2),point(length/2,width/2),point(-length/2,width/2),colour);
    }
    const surface=builder.build(),mesh=new Mesh(own(groundGeometry(surface)),groundMaterial);
    mesh.name='ground-freight-aprons';mesh.renderOrder=-30;groundTriangles+=surface.triangles;root.add(mesh);
  }

  const q = new Quaternion(), up = new Vector3(0, 1, 0), m = new Matrix4(), s = new Vector3(), t = new Vector3(), colour = new Color();

  // Parked cars: the occupied stalls, a seeded tier share of them (deterministic per stall).
  const P = data.parking, car = P.car;
  const body = new BoxGeometry(car.body[0], car.body[2], car.body[1]), cabin = new BoxGeometry(car.cabin[0], car.cabin[2], car.cabin[1]);
  const carGeometry = own(mergeSimple([
    { geometry: body, matrix: new Matrix4().makeTranslation(0, car.lift + car.body[2] / 2, 0) },
    { geometry: cabin, matrix: new Matrix4().makeTranslation(-car.cabinBack, car.lift + car.body[2] + car.cabin[2] / 2, 0) },
  ]));
  const stalls = parkingStalls(P).filter((stall, i) => stall.occupied && hash01(P.seed + 13, i, stall.loop) < tier.parking);
  const carMaterial = own(new MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 }));
  carMaterial.name = 'campus-parked-car';
  const cars = new InstancedMesh(carGeometry, carMaterial, Math.max(1, stalls.length));
  cars.name = 'parked-cars';
  cars.count = stalls.length;
  stalls.forEach((stall, i) => {
    q.setFromAxisAngle(up, -stall.heading);
    cars.setMatrixAt(i, m.compose(t.set(stall.u, data.roads.gradeY, stall.v), q, s.set(1, 1, 1)));
    cars.setColorAt(i, colour.set(P.paints[stall.paint] ?? P.paints[0]!));
  });
  cars.computeBoundingSphere();
  root.add(cars);

  // Satellites: blocks and roof units (unit boxes scaled per instance).
  const sat = satelliteBoxes(data.satellites), unit = own(new BoxGeometry(1, 1, 1));
  const satMaterial = own(new MeshStandardMaterial({ color: data.satellites.colour, roughness: 0.8, metalness: 0 }));
  const roofMaterial = own(new MeshStandardMaterial({ color: data.satellites.roofColour, roughness: 0.6, metalness: 0.3 }));
  satMaterial.name = 'campus-satellite'; roofMaterial.name = 'campus-satellite-roof';
  const boxes = (list: typeof sat.body, material: MeshStandardMaterial, name: string) => {
    const mesh = new InstancedMesh(unit, material, Math.max(1, list.length));
    mesh.name = name;
    mesh.count = list.length;
    list.forEach((b, i) => mesh.setMatrixAt(i, m.compose(t.set(...b.centre), q.identity(), s.set(...b.size))));
    mesh.computeBoundingSphere();
    root.add(mesh);
    return mesh;
  };
  boxes(sat.body, satMaterial, 'satellites');
  boxes(sat.roof, roofMaterial, 'satellite-roofs');

  // Light standards: pole and arm (the arm along +X, turned to the pole's heading), and the lamp heads.
  const L = data.lights, pole = L.pole;
  const standard = own(mergeSimple([
    { geometry: new CylinderGeometry(pole.radius, pole.radius * 1.3, pole.height, 8), matrix: new Matrix4().makeTranslation(0, pole.height / 2, 0) },
    { geometry: new BoxGeometry(pole.arm, pole.radius * 1.2, pole.radius * 1.2), matrix: new Matrix4().makeTranslation(pole.arm / 2, pole.height - pole.radius, 0) },
  ]));
  const poleMaterial = own(new MeshStandardMaterial({ color: L.colour, roughness: 0.5, metalness: 0.6 }));
  poleMaterial.name = 'campus-light-standard';
  const poles = new InstancedMesh(standard, poleMaterial, Math.max(1, L.poles.length));
  poles.name = 'light-standards';
  L.poles.forEach((p, i) => { q.setFromAxisAngle(up, -p.headingDeg * Math.PI / 180); poles.setMatrixAt(i, m.compose(t.set(p.at[0], data.roads.gradeY, p.at[1]), q, s.set(1, 1, 1))); });
  poles.computeBoundingSphere();
  root.add(poles);
  const heads = lampHeads(L), headGeometry = own(new BoxGeometry(pole.head[0], pole.head[1], pole.head[2]));
  const headMaterial = own(new MeshStandardMaterial({ color: L.headColour, roughness: 0.5, metalness: 0.3, emissive: L.lampColour, emissiveIntensity: 0 }));
  headMaterial.name = 'campus-lamp-head';
  const lamps = new InstancedMesh(headGeometry, headMaterial, Math.max(1, heads.length));
  lamps.name = 'lamp-heads';
  heads.forEach((h, i) => {
    q.setFromAxisAngle(up, -L.poles[i]!.headingDeg * Math.PI / 180);
    lamps.setMatrixAt(i, m.compose(t.set(h.u, h.y - pole.head[1] / 2 - pole.radius, h.v), q, s.set(1, 1, 1)));
  });
  lamps.computeBoundingSphere();
  root.add(lamps);
  for (const mesh of [cars, poles, lamps]) disposables.push(mesh);

  return {
    root,
    update(camera) {
      if (!grade) return;
      const reach = camera.far * 0.95;
      grade.scale.setScalar(reach / gradeRadius);
      grade.position.set(camera.position.x, 0, camera.position.z);
    },
    setLamps(level) { headMaterial.emissiveIntensity = level; },
    stats() {
      return {
        groundTriangles, parkedCars: stalls.length, satellites: sat.body.length, lightStandards: L.poles.length, lampHeads: heads.length,
        instances: stalls.length + sat.body.length + sat.roof.length + L.poles.length + heads.length,
      };
    },
    dispose() {
      root.removeFromParent();
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}
