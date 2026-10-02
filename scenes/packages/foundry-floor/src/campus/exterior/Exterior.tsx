// SPDX-License-Identifier: MIT
// The campus exterior inside the canvas (FF-C1 items 2 to 5 and 7): the structures (full near, far shells beyond, by
// tier), the ground, parking, satellites and light standards, the day sky and lights, the orbit with the named views
// (the kit's OrbitRig: one-finger drag orbits, pinch and wheel zoom, two fingers pan; clamped to the campus bounds,
// above grade and above grounded solids), and the drive with its traffic (./Drive, ./traffic; the kit's play mode).
// It is its own chunk, loaded when the exterior starts (D-15). The camera's range belongs to the place: outside, far
// is the tier's and near follows the viewing distance (the depth buffer spans a few metres to tens of kilometres) or
// is the chase camera's while driving; inside, FF2's near and far apply.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Group, Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { asWebGPU, OrbitRig, readDevParams, SystemOrder, useFade, useLoadedPack, usePlayMode, useQuality, useReducedMotion, useRegisterTestHooks, useSceneBuilt, useSceneClock, useSystem } from '@kiln-scenes/scene-kit';
import { CAMPUS_DATA_ID, CAMPUS_VIEW_NAMES, parseCampus } from '../data';
import type { CampusData, CampusTierName, CampusViewName } from '../data';
import { useCampusSession } from '../session';
import { CampusDrive } from './Drive';
import { buildDriveWorld } from './drive-world';
import type { DriveWorld } from './drive-world';
import { buildCampusGround } from './ground';
import type { CampusGround } from './ground';
import { createCampusSky } from './sky';
import type { CampusSky } from './sky';
import { buildCampusStructures } from './structures';
import type { CampusStructures } from './structures';
import { buildCampusVegetation, type CampusVegetation } from './vegetation';
import { parseCampusPlantings, PLANT_SIZES } from './planting';
import { DRIVING_DATA_ID, parseDriving } from '../drive/driving';

const TEST = !!(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV);
const HUD_INTERVAL_MS = 250;
/** After the camera rigs, so LOD, the near plane and the sky see this frame's camera. */
const DRAW_ORDER = SystemOrder.camera + 50;

interface ExteriorWorld { root: Group; structures: CampusStructures; ground: CampusGround; sky: CampusSky }

/** The height below which the orbit camera may not go at (x, z): the top of any grounded solid there, else grade. */
export function orbitFloor(data: CampusData): (x: number, z: number) => number {
  const grounded = data.solids.filter(s => s.min[1] <= 1);
  return (x, z) => {
    let top = data.roads.gradeY;
    for (const s of grounded) if (x >= s.min[0] && x <= s.max[0] && z >= s.min[2] && z <= s.max[2] && s.max[1] > top) top = s.max[1];
    return top;
  };
}

/** Near plane for a viewing distance: about 0.3 % of it, from 0.3 m to 20 m. */
export const nearFor = (distance: number) => Math.min(20, Math.max(0.3, distance * 0.003));

export function useCampusData(): CampusData {
  const pack = useLoadedPack();
  return useMemo(() => {
    const bytes = pack.data.get(CAMPUS_DATA_ID);
    if (!bytes) throw new Error(`The scene pack has no ${CAMPUS_DATA_ID} data entry`);
    return parseCampus(bytes);
  }, [pack]);
}

export function CampusExterior() {
  const pack = useLoadedPack(), quality = useQuality(), markBuilt = useSceneBuilt(), campus = useCampusSession(), fade = useFade(), { playing } = usePlayMode(), clock = useSceneClock();
  const scene = useThree(state => state.scene), camera = useThree(state => state.camera) as PerspectiveCamera, gl = useThree(state => state.gl);
  const data = useCampusData();
  const tierName = quality.tier as CampusTierName, tier = data.tiers[tierName];
  const [world, setWorld] = useState<ExteriorWorld | null>(null), [failure, setFailure] = useState<unknown>(null);
  // The drive and its traffic: undefined while the vehicles load, null for a pack without driving data.
  const [drive, setDrive] = useState<DriveWorld | null | undefined>(undefined);
  const [vegetation, setVegetation] = useState<CampusVegetation | null | undefined>(undefined), reduced = useReducedMotion();
  useEffect(() => { if (reduced) campus.setPaused(true); }, [campus,reduced]);
  const built = useRef<ExteriorWorld | null>(null), hudAt = useRef(-Infinity);
  const floor = useMemo(() => orbitFloor(data), [data]);
  const bounds = useMemo(() => new Box3(new Vector3(...data.orbit.bounds.min), new Vector3(...data.orbit.bounds.max)), [data]);
  const dropOff = useMemo(() => new Vector3(...data.interior.canopyDropOff), [data]);
  if (failure) throw failure;

  // Arriving from the interior, the fade is already down: hold it until the exterior is drawn.
  useLayoutEffect(() => { if (campus.hud.getSnapshot().moving) void fade.to(1, 0); }, [campus, fade]);

  useEffect(() => {
    let w: ExteriorWorld | null = null;
    try {
      const root = new Group(), lights = new Group();
      root.name = 'campus-exterior'; lights.name = 'campus-lights';
      const structures = buildCampusStructures(data, pack.models);
      structures.applyLook(data.looks.day);
      const drivingBytes=pack.data.get(DRIVING_DATA_ID);
      const ground = buildCampusGround(data, tier,drivingBytes?parseDriving(drivingBytes):undefined);
      ground.setLamps(data.looks.day.lamps);
      root.add(ground.root, structures.root, lights);
      const sky = createCampusSky(asWebGPU(gl), scene, lights, data.looks.day, tier.far);
      scene.add(root);
      camera.far = tier.far; camera.near = nearFor(camera.position.length()); camera.updateProjectionMatrix();
      w = { root, structures, ground, sky };
      setWorld(w);
    } catch (error) { setFailure(error); }
    return () => {
      if (w) { w.sky.dispose(); w.ground.dispose(); w.structures.dispose(); w.root.removeFromParent(); }
      setWorld(null); built.current = null; campus.viewReady = false; markBuilt(false);
    };
  }, [pack, data, tier, scene, camera, gl, campus, markBuilt]);

  // The vehicles, the car's roads and the traffic, once the campus stands (the vehicles' levels load asynchronously).
  useEffect(() => {
    if (!world) return;
    let alive = true, d: DriveWorld | null = null;
    buildDriveWorld(data, pack, tier).then(result => {
      if (!alive) { result?.dispose(); return; }
      d = result;
      if (d) world.root.add(d.traffic.root); else campus.resumeDrive = false;
      setDrive(d); campus.hud.set({ driveReady: !!d });
    }, error => { if (alive) setFailure(error); });
    return () => { alive = false; d?.dispose(); setDrive(undefined); campus.hud.set({ driveReady: false }); };
  }, [world, data, pack, tier, campus]);

  // The traffic flows after the car has moved (the car is its obstacle), on the scene clock (Golden Gate's traffic
  // does): the kit's frozen clock (freeze=1) holds it still for captures, where the driveTraffic hook steps it.
  useSystem('campus-traffic', SystemOrder.sim + 10, () => { drive?.traffic.step(campus.hud.getSnapshot().paused ? 0 : clock.delta); });

  useEffect(() => {
    if (!world) return;
    let alive = true, planted: CampusVegetation | null = null;
    let placements;
    try {
      const hasPlants=Object.keys(PLANT_SIZES).some(name=>pack.models.has(`plant-${name}`));
      const bytes=pack.data.get('campus-assets');
      if(hasPlants&&!bytes)throw new Error('The scene pack has plants but no campus-assets data');
      placements=hasPlants?parseCampusPlantings(bytes!,data):[];
    } catch(error){setFailure(error);return;}
    // Test and dev builds take ?plantingShared=false (the per-material planting) for A/B counts and captures.
    const shared = (TEST ? readDevParams({ plantingShared: { kind: 'boolean' } }).plantingShared : undefined) !== false;
    buildCampusVegetation(data, pack.models, placements, { shared }).then(value => {
      if (!alive) { value?.dispose(); return; }
      planted = value; if (value) world.root.add(value.root); setVegetation(value);
    }, error => { if (alive) setFailure(error); });
    return () => { alive = false; planted?.dispose(); setVegetation(undefined); };
  }, [world,data,pack]);

  // Named views from the HUD (and the first view).
  useSystem('campus-views', SystemOrder.path - 10, () => {
    const rig = campus.orbit.current, req = campus.requests;
    if (!rig || !world || (req.view === null && campus.viewReady)) return;
    const name = req.view ?? campus.hud.getSnapshot().view, v = data.views[name];
    req.view = null;
    rig.setView({ position: v.position, target: v.target, fov: v.fov, maxPolar: data.orbit.maxPolar });
    campus.viewReady = true;
  });

  useSystem('campus-exterior-draw', DRAW_ORDER, () => {
    if (!world) return;
    const rig = campus.orbit.current, target = rig?.controls.target, driving = campus.hud.getSnapshot().camera === 'drive';
    const near = driving && drive ? drive.driving.chase.near : nearFor(target ? camera.position.distanceTo(target) : camera.position.y);
    if (Math.abs(camera.near - near) > camera.near * 0.1 || camera.far !== tier.far) { camera.near = near; camera.far = tier.far; camera.updateProjectionMatrix(); }
    world.structures.update(camera, tier.fullWithin * quality.live.lodBias);
    world.ground.update(camera);
    world.sky.update(camera);
    drive?.traffic.draw(camera);
    vegetation?.update(camera, quality.live.lodBias);
    const now = performance.now();
    // While driving, the drive offers Enter (the car stopped in the drop-off zone).
    if (!driving && now - hudAt.current >= HUD_INTERVAL_MS) {
      hudAt.current = now;
      campus.hud.set({ canEnter: camera.position.distanceTo(dropOff) <= data.interior.orbitEnterDistance });
    }
    // Built (and the fade up from the interior) once the first view, the traffic and a restored car are in place.
    if (built.current !== world && campus.viewReady && drive !== undefined && vegetation !== undefined && !campus.resumeDrive) {
      built.current = world;
      markBuilt(true);
      if (campus.hud.getSnapshot().moving) { void fade.to(0, 350); campus.hud.set({ moving: false, status: campus.cameFrom==='drive' ? 'Back in your campus sedan' : 'Back at the south-west arrival canopy' }); }
    }
  });

  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!world || !TEST) return {};
    const target = new Vector3();
    return {
      campusState: () => {
        const rig = campus.orbit.current;
        if (rig) target.copy(rig.controls.target);
        return {
          place: 'exterior', tier: tierName, view: campus.hud.getSnapshot().view, canEnter: campus.hud.getSnapshot().canEnter,
          camera: { position: camera.position.toArray(), target: target.toArray(), fov: camera.fov, near: camera.near, far: camera.far },
          structures: world.structures.stats(), ground: world.ground.stats(), vegetation: vegetation?.stats() ?? null, paused: campus.hud.getSnapshot().paused, fog: world.sky.fog,
          placements: world.structures.placed.map(s => ({ id: s.placement.id, showing: s.showing })),
        };
      },
      campusView: (name: CampusViewName) => { if (!CAMPUS_VIEW_NAMES.includes(name)) throw new Error(`Unknown campus view ${String(name)}`); campus.setView(name); return name; },
      campusPose: (position: [number, number, number], targetAt: [number, number, number], fov = 50) => { campus.orbit.current?.setView({ position, target: targetAt, fov, maxPolar: data.orbit.maxPolar }); return true; },
      campusForceTier: (tierFor: 'full' | 'far' | null) => { world.structures.force(tierFor); return world.structures.stats(); },
      counts: () => {
        const s = world.structures.stats(), g = world.ground.stats(), t = drive?.traffic.stats() ?? null;
        return { structuresFull: s.full, structuresFar: s.far, structureMeshes: s.meshes, structureTriangles: s.triangles, groundTriangles: g.groundTriangles, parkedCars: g.parkedCars, instances: g.instances,
          vegetation: vegetation?.stats() ?? null, traffic: t && { vehicles: t.vehicles, drawn: t.drawn, draws: t.draws, triangles: t.triangles, perLevel: t.perLevel, contactShadows: t.contactShadows } };
      },
      /** The traffic's counters and a sample of its vehicles; `advance` steps the flow by fixed steps first (seconds). */
      driveTraffic: (limit = 12, advance = 0) => {
        if (!drive) return null;
        if (advance > 0) drive.traffic.advance(advance);
        return { stats: drive.traffic.stats(), sample: drive.traffic.sample(limit), time: drive.traffic.sim.time,
          models: [...drive.models.values()].map(m => ({ type: m.type, length: m.length, width: m.width, height: m.height, wheelbase: m.wheelbase, wheelRadius: m.wheelRadius, triangles: m.triangles, lodSource: m.lodSource })) };
      },
    };
  }, [world, drive, vegetation, campus, camera, data, tierName]);
  useRegisterTestHooks(hooks);

  return <>
    <OrbitRig rigRef={campus.orbit} active={!(playing && drive)} target={data.views.campus.target} minDistance={data.orbit.minDistance} maxDistance={data.orbit.maxDistance}
      maxPolar={data.orbit.maxPolar} pan floor={floor} clearance={data.orbit.clearance} bounds={bounds}/>
    {drive && <CampusDrive drive={drive} data={data}/>}
  </>;
}
