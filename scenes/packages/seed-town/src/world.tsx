import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, EquirectangularReflectionMapping, Group, InstancedMesh, LinearFilter,
  Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector3,
} from 'three/webgpu';
import type { Texture, WebGPURenderer } from 'three/webgpu';
import { SystemOrder, useBuilt, useLoadedPack, useSceneBuilt, useSystem } from '@kiln-scenes/scene-kit';
import type { LoadedPack } from '@kiln-scenes/scene-kit';
import type { CachedSunShadow } from '@kiln-scenes/scene-kit/shadows';
import { buildTownCollision } from './collision';
import { townLights } from './glow';
import type { Pool } from './glow';
import { createCountry } from './country';
import type { Country } from './country';
import { DAY, DUSK } from './light';
import type { Hour } from './light';
import { createImpostors } from './impostors';
import type { Impostors } from './impostors';
import type { KitDeclaration } from './kit-spec';
import { townFrame } from './layout';
import { planOutskirts } from './outskirts';
import type { Outskirts } from './outskirts';
import { planTown } from './plan/town-plan.js';
import type { Reflection, TownSession, TownState } from './session';
import { paintReflection } from './sky';
import { createTownView, KIT_IDS, readKit } from './town';
import type { Kit, TownView } from './town';

/** The pack's `kits` data file: each kit's defaults and size ranges, from its saved declaration. */
export function readDeclarations(pack: LoadedPack): Record<string, KitDeclaration> {
  const bytes = pack.data.get('kits');
  if (!bytes) throw new Error('Seed town pack has no kit declarations');
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { schema?: string; kits?: Record<string, KitDeclaration> };
  if (parsed.schema !== 'kiln.seed-town-kits/1' || !parsed.kits) throw new Error('Seed town kit declarations are not readable');
  return parsed.kits;
}

const REFLECTION = { width: 128, height: 64 };

/**
 * What the window glass reflects: a small picture of the sky above the roofs and the lit street at
 * eye level, repainted when the hour changes. On its own the glass in the kits is nearly black.
 */
function createReflection(hour: Hour): Reflection {
  const bytes = new Uint8Array(REFLECTION.width * REFLECTION.height * 4);
  const texture = new DataTexture(paintReflection(hour, REFLECTION.width, REFLECTION.height, bytes), REFLECTION.width, REFLECTION.height, RGBAFormat, UnsignedByteType);
  texture.name = 'Seed town reflection';
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return {
    texture,
    paint(next) {
      paintReflection(next, REFLECTION.width, REFLECTION.height, bytes);
      texture.needsUpdate = true;
      texture.needsPMREMUpdate = true;
    },
    dispose() { texture.dispose(); },
  };
}

/** Glass as a mirror of that picture: bright where it shows sky, darker where it shows the street. */
function mirrorGlass(material: MeshStandardMaterial, reflection: Reflection): () => void {
  const before = { color: material.color.clone(), metalness: material.metalness, roughness: material.roughness, envMap: material.envMap, envMapIntensity: material.envMapIntensity };
  material.color.setRGB(0.4, 0.45, 0.5, SRGBColorSpace);
  material.metalness = 1;
  material.roughness = 0.08;
  material.envMap = reflection.texture;
  material.envMapIntensity = 1;
  material.needsUpdate = true;
  return () => {
    material.color.copy(before.color);
    Object.assign(material, { metalness: before.metalness, roughness: before.roughness, envMap: before.envMap, envMapIntensity: before.envMapIntensity });
    material.needsUpdate = true;
  };
}

/** Lamp light is warmer than window light; both are added to what the sun and sky leave on the ground. */
const POOL_TINT: Record<Pool['tint'], [number, number, number, number]> = { lamp: [1, 0.62, 0.28, 0.4], window: [1, 0.72, 0.4, 0.46] };
/** Above the pavement, so the pool never fights it for depth. */
const POOL_LIFT = 0.02;

/** A unit disc lying flat, bright in the middle and black at the rim. */
function poolGeometry(): BufferGeometry {
  const rings = 5, segments = 32, positions = [0, 0, 0], colors = [1, 1, 1], index: number[] = [];
  for (let r = 1; r <= rings; r++) {
    const radius = r / rings, fade = (1 - radius * radius) ** 2;
    for (let s = 0; s < segments; s++) {
      const angle = s / segments * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      colors.push(fade, fade, fade);
    }
  }
  for (let s = 0; s < segments; s++) index.push(0, 1 + (s + 1) % segments, 1 + s);
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const inner = 1 + (r - 1) * segments, outer = inner + segments, next = (s + 1) % segments;
      index.push(inner + s, inner + next, outer + s, inner + next, outer + next, outer + s);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(index);
  return geometry;
}

/** Every pool of light in the town as one instanced draw, added over the ground. */
function createPools(parent: Group): { fit(pools: readonly Pool[], offset: readonly [number, number, number]): void; strength(value: number): void; dispose(): void } {
  const geometry = poolGeometry();
  const material = new MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  material.name = 'light-pools';
  let mesh: InstancedMesh | null = null, capacity = 0, shown = 0;
  const matrix = new Matrix4(), position = new Vector3(), turn = new Quaternion(), scale = new Vector3(), up = new Vector3(0, 1, 0), color = new Color();
  return {
    fit(pools, offset) {
      if (!mesh || pools.length > capacity) {
        mesh?.removeFromParent();
        mesh?.dispose();
        capacity = Math.max(16, Math.ceil(pools.length * 1.3));
        mesh = new InstancedMesh(geometry, material, capacity);
        mesh.name = 'Light pools';
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        parent.add(mesh);
      }
      pools.forEach((pool, i) => {
        const tint = POOL_TINT[pool.tint];
        position.set(pool.x + offset[0], POOL_LIFT, pool.z + offset[2]);
        turn.setFromAxisAngle(up, pool.yaw * Math.PI / 180);
        scale.set(pool.out, 1, pool.along);
        mesh!.setMatrixAt(i, matrix.compose(position, turn, scale));
        mesh!.setColorAt(i, color.setRGB(tint[0], tint[1], tint[2], SRGBColorSpace).multiplyScalar(tint[3] * pool.strength));
      });
      mesh.count = pools.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = shown > 0.003 && mesh.count > 0;
    },
    strength(value) {
      shown = value;
      material.color.setScalar(value);
      if (mesh) mesh.visible = value > 0.003 && mesh.count > 0;
    },
    dispose() { mesh?.removeFromParent(); mesh?.dispose(); geometry.dispose(); material.dispose(); },
  };
}

interface World {
  root: Group;
  view: TownView;
  kits: Map<string, Kit>;
  pools: ReturnType<typeof createPools>;
  country: Country;
  impostors: Impostors;
  stand(state: TownState, session: TownSession): boolean;
  dispose(): void;
}

function buildWorld(pack: LoadedPack, session: TownSession): World {
  const declarations = readDeclarations(pack);
  const kits = new Map<string, Kit>();
  const restore: (() => void)[] = [];
  const reflection = createReflection(session.getState().dusk ? DUSK : DAY);
  session.reflection = reflection;
  const mirrored = new Set<MeshStandardMaterial>();
  for (const id of KIT_IDS) {
    const gltf = pack.models.get(id), declaration = declarations[id];
    if (!gltf || !declaration) throw new Error(`Seed town pack is missing the ${id} kit`);
    const kit = readKit(id, gltf, declaration);
    kits.set(id, kit);
    for (const part of kit.parts) {
      const material = part.material;
      for (const map of [material.map, material.normalMap, material.roughnessMap] as (Texture | null)[]) {
        if (map && map.anisotropy < 8) { map.anisotropy = 8; map.needsUpdate = true; }
      }
      if (material.name === 'glass' && !mirrored.has(material)) {
        mirrored.add(material);
        restore.push(mirrorGlass(material, reflection));
      }
      const lit = material.emissive.r + material.emissive.g + material.emissive.b > 0;
      if (lit && !session.glow.some(item => item.material === material)) {
        const base = material.emissiveIntensity, colour = material.color.clone();
        // A lit pane shows its own light, not the street's: keep what the sky and lamps add to it low.
        material.color.multiplyScalar(0.3);
        restore.push(() => { material.color.copy(colour); });
        session.glow.push({ material, base });
        restore.push(() => { material.emissiveIntensity = base; });
      }
    }
  }
  const root = new Group();
  root.name = 'Seed town world';
  const view = createTownView(kits);
  root.add(view.root);
  // A road out of the town wears the paving kit's own setts and stone.
  const paving = kits.get('paving')!.parts;
  const mapOf = (name: string) => paving.find(part => part.material.name === name)?.material.map ?? null;
  const country = createCountry(root, { sett: mapOf('sett'), stone: mapOf('kerb') });
  const impostors = createImpostors(root, kits.get('tree')!);
  const pools = createPools(root);
  let standing: string | null = null, outskirts: Outskirts | null = null, disposed = false;
  return {
    root, view, kits, pools, country, impostors,
    /** Stand the town for this seed and hour. Returns true when a mesh was replaced. */
    stand(state, target) {
      const started = performance.now();
      const plan = planTown(state.seed, { dusk: state.dusk });
      const frame = townFrame(plan);
      // The country round a town follows its seed alone; the hour changes nothing out there.
      if (!outskirts || standing !== plan.seed) outskirts = planOutskirts(plan);
      const placements = plan.placements.concat(outskirts.trees);
      const replaced = view.apply({ ...plan, placements });
      const buildMs = performance.now() - started;
      view.root.position.set(frame.offset[0], frame.offset[1], frame.offset[2]);
      view.root.updateMatrixWorld(true);
      // The hour decides which lamps and fronts are lit, so the light is laid on every stand.
      const lights = townLights(plan);
      pools.fit(lights.pools, frame.offset);
      target.lanterns = lights.lanterns.map(l => ({ x: l.x + frame.offset[0], y: l.y + frame.offset[1], z: l.z + frame.offset[2] }));
      // The hour only changes which lit parts show; streets, kerbs and walls stay where they are.
      if (standing !== plan.seed) {
        country.fit(frame, outskirts);
        impostors.fit(outskirts.far, frame.offset);
        const previous = target.collision;
        target.collision = buildTownCollision(kits, plan, frame, outskirts.trees);
        previous?.dispose();
        target.frame = frame;
        target.revision += 1;
        standing = plan.seed;
      }
      target.setInfo({
        seed: plan.seed, buildings: plan.town.buildings, placements: placements.length,
        instances: view.stats.instances, draws: view.stats.draws, triangles: view.stats.triangles, buildMs,
      });
      return replaced;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      view.dispose();
      country.dispose();
      impostors.dispose();
      pools.dispose();
      if (session.reflection === reflection) session.reflection = null;
      reflection.dispose();
      session.lanterns = [];
      session.collision?.dispose();
      session.collision = null;
      session.frame = null;
      for (const undo of restore) undo();
      session.glow.length = 0;
      root.clear();
    },
  };
}

interface Tracked { cache: CachedSunShadow; untrack(): void }

/** The town for the session's seed and hour. A change of either rewrites instance buffers; nothing is fetched. */
export function TownWorld({ session }: { session: TownSession }) {
  const pack = useLoadedPack();
  const markBuilt = useSceneBuilt();
  const world = useBuilt(() => buildWorld(pack, session), value => value.dispose(), [pack, session]);
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const tracked = useRef<Tracked | null>(null), stale = useRef(true);
  const renderer = useThree(three => three.gl) as unknown as WebGPURenderer;

  useEffect(() => {
    if (!world) return;
    if (world.stand(state, session)) stale.current = true;
    session.sun?.cache?.invalidate('town');
    markBuilt(true);
  }, [world, state, session, markBuilt]);
  useEffect(() => () => { markBuilt(false); }, [world, markBuilt]);

  useSystem('seed-town-shadow-track', SystemOrder.shadows - 1, () => {
    if (!world) return;
    // The far trees' pictures are taken from the tree kit on the first frame the renderer can draw.
    if (!world.impostors.ready && renderer.initialized) world.impostors.prepare(renderer);
    world.pools.strength(session.pools);
    world.country.light(session.sunDir, session.pools);
    const cache = session.sun?.cache ?? null;
    if (tracked.current && (tracked.current.cache !== cache || stale.current)) {
      tracked.current.untrack();
      tracked.current = null;
    }
    if (!cache || tracked.current) return;
    const casters = cache.track(world.root);
    cache.invalidate('town');
    tracked.current = { cache, untrack: () => casters.untrack() };
    stale.current = false;
  });
  useEffect(() => () => { tracked.current?.untrack(); tracked.current = null; stale.current = true; }, [world]);

  return world ? <primitive object={world.root} dispose={null} /> : null;
}
