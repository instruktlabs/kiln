import { useEffect, useMemo, useRef } from 'react';
import { AgXToneMapping, Box3, BoxGeometry, DataTexture, DirectionalLight, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, PlaneGeometry, Sphere, Vector3 } from 'three/webgpu';
import { useBuilt, useSystem, SystemOrder, disposeObject3D } from '../src/lifecycle';
import { useSceneBuilt } from '../src/contract';
import { useRuntime } from '../src/internal/runtime';
import { InstancedGroup, assertInstancingSafe, useCellStreamer, useZoneVisibility } from '../src/instancing';
import type { InstanceHandle, InstanceSet, CellStreamerOptions } from '../src/instancing';
import { disposeLoadedModels } from '../src/assets';
import type { LoadedPack } from '../src/assets';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { registerTestHooks } from '../src/testing';
import { useQuality } from '../src/quality';

function buildWorld(pack: LoadedPack) {
  const root = new Group(); root.name = 'demo-world';
  const groundGeometry = new PlaneGeometry(360, 420), groundMaterial = new MeshStandardMaterial({ color: '#657665', roughness: 1 });
  const ground = new Mesh(groundGeometry, groundMaterial); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.02, -125); ground.receiveShadow = true; root.add(ground);
  const hemisphere = new HemisphereLight(0xe9f3ff, 0x515138, 2.1); root.add(hemisphere);
  const sun = new DirectionalLight(0xffedcf, 3.2); sun.position.set(20, 35, 14); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -25; sun.shadow.camera.right = 25; sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25; sun.shadow.camera.near = 1; sun.shadow.camera.far = 90; sun.shadow.normalBias = .025; sun.shadow.camera.updateProjectionMatrix(); root.add(sun, sun.target);
  const cubeGeometry = new BoxGeometry(.7, 1.2, .7), cubeMaterial = new MeshStandardNodeMaterial({ color: '#96bd84', roughness: .85 });
  const matrices = new Float32Array(10000 * 16), matrix = new Matrix4();
  for (let i = 0; i < 10000; i++) matrix.makeTranslation((i % 100) * 3 - 150, .6, -25 - Math.floor(i / 100) * 3).toArray(matrices, i * 16);
  const staticSet: InstanceSet = { key: 'ten-thousand', geometry: cubeGeometry, material: cubeMaterial, matrices, cellSize: 24, density: 'instance', castShadow: false, receiveShadow: true };
  const dynamicGeometry = new BoxGeometry(1.4, 1.4, 1.4), dynamicMaterial = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: .5 });
  const dynamicMatrices = new Float32Array(3 * 16); for (let i = 0; i < 3; i++) matrix.makeTranslation(i * 4 - 4, .8, 4).toArray(dynamicMatrices, i * 16);
  const dynamicSet: InstanceSet = { key: 'dynamic-colours', geometry: dynamicGeometry, material: dynamicMaterial, matrices: dynamicMatrices, colors: new Float32Array([1, .04, .04, .04, 1, .04, .04, .04, 1]), cellSize: 0, density: 'none', dynamic: true, bounds: new Sphere(new Vector3(0, 1, 4), 15), castShadow: true, receiveShadow: true };
  const normalGeometry = new BoxGeometry(1.7, 2, 1.7); normalGeometry.computeTangents();
  const normalTexture = new DataTexture(new Uint8Array([128,128,255,255, 152,128,250,255, 128,152,250,255, 104,128,250,255]), 2, 2); normalTexture.needsUpdate = true;
  const normalMaterial = new MeshStandardNodeMaterial({ color: '#f4cd91', normalMap: normalTexture, roughness: .45 });
  const normalMatrices = new Float32Array(2 * 16); matrix.makeRotationY(.4).setPosition(-7, 1, -2).toArray(normalMatrices); matrix.makeRotationY(-.6).setPosition(-10, 1, -2).toArray(normalMatrices, 16);
  const normalSet: InstanceSet = { key: 'tangent-proof', geometry: normalGeometry, material: normalMaterial, matrices: normalMatrices, cellSize: 0, density: 'none', castShadow: true, receiveShadow: true };
  const normalReference = new Group(); normalReference.name = 'normal-reference'; normalReference.visible = false;
  if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) {
    for (let i = 0; i < 2; i++) { const mesh = new Mesh(normalGeometry, normalMaterial); mesh.name = `authored-tangent-reference-${i}`; mesh.matrix.fromArray(normalMatrices, i * 16); mesh.matrixAutoUpdate = false; mesh.castShadow = mesh.receiveShadow = true; normalReference.add(mesh); }
    root.add(normalReference);
  }
  let n = 0; for (const gltf of pack.models.values()) { const model = gltf.scene.clone(true); model.name = `eager-pack-${n}`; model.position.set(-7 + n * 3, 1, -8); model.scale.setScalar(2); root.add(model); n++; }
  const zoneRoots = new Map<string, Group>();
  for (const [id, x, color] of [['left', -14, '#d38841'], ['right', 14, '#568ccc']] as const) { const group = new Group(); group.name = `zone-${id}`; group.position.set(x, .5, -14); const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color })); group.add(mesh); root.add(group); zoneRoots.set(id, group); }
  return {
    root, staticSet, dynamicSet, normalSet, normalReference, zoneRoots, dynamicOffset: 0,
    dispose() {
      root.removeFromParent(); groundGeometry.dispose(); groundMaterial.dispose(); sun.shadow.dispose();
      cubeGeometry.dispose(); cubeMaterial.dispose(); dynamicGeometry.dispose(); dynamicMaterial.dispose(); normalGeometry.dispose(); normalMaterial.dispose(); normalTexture.dispose();
      for (const group of zoneRoots.values()) disposeObject3D(group); root.clear();
    },
  };
}

export function DemoWorld() {
  const runtime = useRuntime(), quality = useQuality(), markBuilt = useSceneBuilt();
  const built = useBuilt(() => buildWorld(runtime.pack!), value => value.dispose(), [runtime.pack]);
  const dynamic = useRef<InstanceHandle | null>(null), matrix = useMemo(() => new Matrix4(), []), view = useMemo(() => new Vector3(0, 0, 0), []);
  const zones = useMemo(() => [
    { id: 'left', bounds: new Box3(new Vector3(-200, -20, -350), new Vector3(0, 100, 100)), neighbors: ['right'] },
    { id: 'right', bounds: new Box3(new Vector3(0, -20, -350), new Vector3(200, 100, 100)), neighbors: ['left'] },
  ], []);
  const roots = useMemo(() => new Map<string, Group>(), []);
  const point = useMemo(() => () => view, [view]), hops = useMemo(() => () => quality.live.zoneHops, [quality]);
  useEffect(() => { roots.clear(); for (const [id, root] of built?.zoneRoots ?? []) roots.set(id, root); }, [built, roots]);
  const zone = useZoneVisibility(zones, roots, point, hops);
  const streamerOptions = useMemo<CellStreamerOptions<GLTF | null>>(() => {
    const owned = new WeakSet<GLTF>();
    return {
    cellSize: 32, viewpoint: point, radius: () => 0, hysteresis: .1, concurrent: 1, attachBudgetMs: 2, maxResident: 1, graceMs: 1000,
    async load(cell, signal) { return cell.x === 0 && cell.y === 0 && cell.z === 0 ? runtime.reader!.loadGlb('cells/0-0-0.glb', signal) : null; },
    attach(_cell, content, registry) { if (!content || !built) return; content.scene.position.set(10, 1, -12); content.scene.scale.setScalar(2); content.scene.name = 'verified-streamed-cell'; built.root.add(content.scene); owned.add(content); registry.add(() => { disposeLoadedModels([content]); owned.delete(content); }); },
    detach(_cell, content) { if (content) { content.scene.removeFromParent(); if (!owned.has(content)) disposeLoadedModels([content]); } },
    onCellError(_cell, error) { runtime.data.set('demoCellError', String(error)); },
    };
  }, [point, runtime, built]);
  const streamer = useCellStreamer(streamerOptions);
  useSystem('demo-instance-animation', SystemOrder.sim + 1, () => {
    if (!built || !dynamic.current) return;
    for (let i = 0; i < 3; i++) dynamic.current.setMatrix(i, matrix.makeTranslation(i * 4 - 4 + built.dynamicOffset, .8 + Math.sin(runtime.clock.ambient + i) * .12, 4));
    dynamic.current.flush();
  });
  useSystem('demo-built-gate', SystemOrder.frameGraph + 20, (_dt, _elapsed, state) => {
    if (!built) return;
    view.copy(state.camera.position);
    // Stream the origin fixture while the camera is in the initial forecourt.
    if (Math.abs(view.x) < 32 && Math.abs(view.z) < 32) view.set(1, 1, 1);
    if (!runtime.built && state.scene.getObjectByName('ten-thousand') && state.scene.getObjectByName('dynamic-colours') && state.scene.getObjectByName('tangent-proof') && runtime.data.get('demoRigsBuilt')) markBuilt(true);
  });
  useEffect(() => () => markBuilt(false), [markBuilt]);
  useEffect(() => {
    if (!built || !(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV)) return;
    return registerTestHooks({
      counts: () => ({ configuredInstances: 10000, eagerModels: runtime.pack!.models.size, tangentOffenders: assertInstancingSafe(runtime.state!.scene), residentCells: streamer.stats().resident }),
      instanceStats: () => { const meshes: { name: string; count: number; tangent: boolean; colors: number[] | null }[] = []; runtime.state?.scene.traverse(o => { const m = o as any; if (m.isInstancedMesh) meshes.push({ name: m.name, count: m.count, tangent: m.geometry.hasAttribute('tangent'), colors: m.instanceColor ? Array.from(m.instanceColor.array) : null }); }); return meshes; },
      moveDynamic: (offset: number) => { built.dynamicOffset = offset; },
      dynamicPosition: () => { const m = runtime.state!.scene.getObjectByName('dynamic-colours/0,0/lod-0') as any; return m ? Array.from(m.instanceMatrix.array.slice(12, 15)) : null; },
      tangentProof: () => { const unsafe = new InstancedMesh(built.normalSet.geometry, built.normalSet.material, 1); unsafe.name = 'deliberately unsafe proof'; const flaggedWithout = assertInstancingSafe(unsafe); unsafe.dispose(); return { sourceHasTangent: built.normalSet.geometry.hasAttribute('tangent'), offenders: assertInstancingSafe(runtime.state!.scene), flaggedWithout }; },
      normalProofMode: (mode: 'instanced' | 'reference') => { const instanced = runtime.state!.scene.getObjectByName('tangent-proof'); if (instanced) instanced.visible = mode === 'instanced'; built.normalReference.visible = mode === 'reference'; },
      normalProofRects: () => { const camera = runtime.state!.camera, size = runtime.state!.size; built.normalReference.updateWorldMatrix(true, true); return built.normalReference.children.map(mesh => { const box = new Box3().setFromObject(mesh), p = new Vector3(); let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (let i = 0; i < 8; i++) { p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera); const x = (p.x + 1) * size.width / 2, y = (1 - p.y) * size.height / 2; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }; }); },
      instanceProofView: () => { const api = runtime.data.get('demoRigs') as any; api.setMode('orbit'); api.orbit.current?.setView({ position: [0, 12, 30], target: [0, .8, 0], fov: 40 }); },
      instanceDensity: (density?: number) => { if (density !== undefined) quality.setLive({ instanceDensity: density }); return quality.live.instanceDensity; },
      lookProof: () => ({ toneMapping: runtime.renderer!.toneMapping, expectedAgX: AgXToneMapping, exposure: runtime.renderer!.toneMappingExposure }),
      zoneHops: (value: number) => quality.setLive({ zoneHops: value }),
      streamStats: () => ({ ...streamer.stats(), visibleNode: !!runtime.state?.scene.getObjectByName('verified-streamed-cell') }), zoneState: () => ({ current: zone.current(), visible: [...roots].filter(([, r]) => r.visible).map(([id]) => id) }),
      tintProbePositions: () => [-4, 0, 4].map(x => { const p = new Vector3(x + built.dynamicOffset, .8, 4).project(runtime.state!.camera); const size = runtime.state!.size; return { x: (p.x + 1) * size.width / 2, y: (1 - p.y) * size.height / 2 }; }),
    }, runtime);
  }, [built, roots, runtime, streamer.stats, zone.current]);
  return <>{built && <><primitive object={built.root} dispose={null}/><InstancedGroup set={built.staticSet} drawDistance={480}/><InstancedGroup set={built.dynamicSet} handleRef={dynamic}/><InstancedGroup set={built.normalSet}/></>}</>;
}
