/// <reference lib="dom" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { validateAssetGlb } from '../assets';
import { frameAssetBounds } from './framing';
import {
  captureCameraView,
  restoreCameraView,
  explorationOffset,
  type CameraView,
} from './camera-state';
import { summarizeFrameTimes, type StagePerformanceReceipt } from './performance';
import { acceptLoadedResource } from './load-guard';

/** The gallery's local studio lighting, orbit controls, and framing in a small standalone surface. */
export function createAssetStage(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x151a12);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Interactive 3D asset. Drag to orbit or use Explore navigation.',
  );
  const heldKeys = new Set<string>();
  let explore = false;
  let movementScale = 1;
  const movementKeys = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'KeyE',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ShiftLeft',
    'ShiftRight',
  ]);
  const keyDown = (event: KeyboardEvent) => {
    if (!explore || !movementKeys.has(event.code)) return;
    event.preventDefault();
    heldKeys.add(event.code);
  };
  const keyUp = (event: KeyboardEvent) => heldKeys.delete(event.code);
  const clearKeys = () => heldKeys.clear();
  renderer.domElement.addEventListener('keydown', keyDown);
  renderer.domElement.addEventListener('keyup', keyUp);
  renderer.domElement.addEventListener('blur', clearKeys);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  const sun = new THREE.DirectionalLight(0xfff1d7, 2.4);
  sun.position.set(4, 8, 5);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xe1edda, 0x4d493d, 1.7));
  let root: THREE.Group | undefined;
  let mixer: THREE.AnimationMixer | undefined;
  let clips: THREE.AnimationClip[] = [];
  let running = true;
  let last = performance.now();
  let frame = 0;
  let generation = 0;
  let disposed = false;
  let firstFrameStart: number | undefined;
  let loadToFirstFrameMs: number | undefined;
  let measurement:
    | {
        started: number;
        previous: number;
        duration: number;
        samples: number[];
        resolve(value: StagePerformanceReceipt): void;
        reject(error: Error): void;
        timeout: ReturnType<typeof setTimeout>;
      }
    | undefined;
  const cancelMeasurement = (reason: string) => {
    if (!measurement) return;
    clearTimeout(measurement.timeout);
    measurement.reject(new Error(reason));
    measurement = undefined;
  };
  const performanceReceipt = (now: number): StagePerformanceReceipt => {
    const gl = renderer.getContext();
    const hardware = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      version: 'kiln.viewer-performance.v1',
      measuredAt: new Date().toISOString(),
      windowMs: now - measurement!.started,
      frameMs: summarizeFrameTimes(measurement!.samples),
      ...(loadToFirstFrameMs === undefined ? {} : { loadToFirstFrameMs }),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      lines: renderer.info.render.lines,
      points: renderer.info.render.points,
      geometryObjects: renderer.info.memory.geometries,
      textureObjects: renderer.info.memory.textures,
      shaderPrograms: renderer.info.programs?.length ?? 0,
      viewport: {
        cssWidth: container.clientWidth,
        cssHeight: container.clientHeight,
        bufferWidth: renderer.domElement.width,
        bufferHeight: renderer.domElement.height,
        devicePixelRatio: renderer.getPixelRatio(),
      },
      renderer: {
        version: String(gl.getParameter(gl.VERSION)),
        vendor: String(gl.getParameter(gl.VENDOR)),
        renderer: String(gl.getParameter(gl.RENDERER)),
        browser: navigator.userAgent,
        ...(hardware
          ? {
              unmaskedVendor: String(gl.getParameter(hardware.UNMASKED_VENDOR_WEBGL)),
              unmaskedRenderer: String(gl.getParameter(hardware.UNMASKED_RENDERER_WEBGL)),
            }
          : {}),
      },
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
        fov: camera.fov,
      },
      limitations: [
        'Exploratory measurement: workloads outside this page are uncontrolled. This is not an isolated performance baseline or budget acceptance.',
        'Frame intervals measure browser requestAnimationFrame pacing, including scheduling and vertical sync; they are not GPU execution time.',
        'Load-to-first-frame begins at GLB parsing and ends after the first render submission; it excludes download time and does not measure presentation latency.',
        'Draw and resource counts come from this Three.js renderer, including studio lighting resources. Object counts are not GPU memory bytes.',
        'This receipt describes this viewport, camera and device only. It is not a performance qualification for other consumers or hardware.',
      ],
    };
  };
  const disposeModel = (model: THREE.Object3D) => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    for (const value of [...geometries, ...materials, ...textures]) value.dispose();
  };
  const reset = () => {
    if (!root) return;
    const box = new THREE.Box3().setFromObject(root, true);
    const components: THREE.Box3[] = [];
    root.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points
      ) {
        const bounds = new THREE.Box3().setFromObject(object, true);
        if (!bounds.isEmpty()) components.push(bounds);
      }
    });
    const { center, radius, distance, position } = frameAssetBounds(
      box,
      camera.aspect,
      camera.fov,
      components,
    );
    controls.target.copy(center);
    camera.position.copy(position);
    camera.near = Math.max(radius / 1000, 0.0001);
    camera.far = distance + radius * 100;
    controls.minDistance = radius * 0.1;
    controls.maxDistance = radius * 80;
    movementScale = Math.max(radius * 0.35, 0.01);
    if (explore) controls.minDistance = radius * 0.00001;
    camera.updateProjectionMatrix();
    controls.update();
  };
  const resize = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resize.observe(container);
  const animate = (now: number) => {
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (container.clientWidth && container.clientHeight) {
      if (running) mixer?.update(dt);
      if (explore && heldKeys.size) {
        const offset = explorationOffset(
          camera,
          heldKeys,
          dt * movementScale * (heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight') ? 3 : 1),
        );
        camera.position.add(offset);
        controls.target.add(offset);
      }
      controls.update();
      renderer.render(scene, camera);
      if (firstFrameStart !== undefined) {
        loadToFirstFrameMs = performance.now() - firstFrameStart;
        firstFrameStart = undefined;
      }
      if (measurement) {
        if (measurement.previous > 0 && measurement.samples.length < 1800)
          measurement.samples.push(now - measurement.previous);
        measurement.previous = now;
        if (now - measurement.started >= measurement.duration && measurement.samples.length) {
          const receipt = performanceReceipt(now);
          clearTimeout(measurement.timeout);
          measurement.resolve(receipt);
          measurement = undefined;
        }
      }
    } else {
      heldKeys.clear();
      cancelMeasurement('Keep the measured viewport visible for the complete sampling window.');
    }
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);
  return {
    async load(
      bytes: Uint8Array,
      options: {
        preserveView?: boolean;
        isCurrent?: () => boolean;
        onCommit?: () => void;
      } = {},
    ) {
      const loadStarted = performance.now();
      const current = ++generation;
      cancelMeasurement('The artifact changed during measurement. Measure the new revision again.');
      validateAssetGlb(bytes);
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (!url.startsWith('blob:') && !url.startsWith('data:'))
          throw new Error('External model resources are not loaded');
        return url;
      });
      const parsed = await new GLTFLoader(manager).parseAsync(Uint8Array.from(bytes).buffer, '');
      const gltf = acceptLoadedResource(
        parsed,
        () => !disposed && current === generation && options.isCurrent?.() !== false,
        (stale) => disposeModel(stale.scene),
      );
      if (!gltf) return undefined;
      const previousView =
        root && options.preserveView ? captureCameraView(camera, controls.target) : undefined;
      if (root) {
        mixer?.stopAllAction();
        mixer?.uncacheRoot(root);
        scene.remove(root);
        disposeModel(root);
      }
      root = gltf.scene;
      firstFrameStart = loadStarted;
      loadToFirstFrameMs = undefined;
      scene.add(root);
      clips = gltf.animations;
      mixer = new THREE.AnimationMixer(root);
      running = true;
      const width = container.clientWidth,
        height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width && height ? width / height : camera.aspect;
      reset();
      if (previousView) {
        restoreCameraView(
          camera,
          controls.target,
          previousView,
          new THREE.Box3().setFromObject(root, true),
        );
        controls.update();
      }
      let triangles = 0,
        meshes = 0;
      const materials = new Set<THREE.Material>();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes++;
        triangles +=
          ((mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0) / 3) *
          ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          materials.add(m);
      });
      // Publish identity with the scene, before another queued selection can run.
      options.onCommit?.();
      return { triangles, meshes, materials: materials.size, clips: clips.map((c) => c.name) };
    },
    reset,
    cancelMeasurement,
    measure(duration = 3000): Promise<StagePerformanceReceipt> {
      if (disposed || !root || !container.clientWidth || !container.clientHeight)
        return Promise.reject(
          new Error('Load an artifact in a visible viewport before measuring.'),
        );
      if (!Number.isFinite(duration) || duration < 1000 || duration > 5000)
        return Promise.reject(new Error('Measurement duration must be 1–5 seconds.'));
      if (measurement) return Promise.reject(new Error('A measurement is already running.'));
      return new Promise((resolve, reject) => {
        measurement = {
          started: performance.now(),
          previous: 0,
          duration,
          samples: [],
          resolve,
          reject,
          timeout: setTimeout(
            () =>
              cancelMeasurement(
                'Measurement was interrupted or the browser stopped delivering frames.',
              ),
            duration + 2000,
          ),
        };
      });
    },
    view(): CameraView {
      return captureCameraView(camera, controls.target);
    },
    setView(view: CameraView) {
      if (!root) return;
      restoreCameraView(camera, controls.target, view, new THREE.Box3().setFromObject(root, true));
      controls.update();
    },
    navigation(value: string) {
      explore = value === 'explore';
      heldKeys.clear();
      controls.minDistance = explore ? 0.00001 : movementScale / 3.5;
      if (explore) {
        camera.near = 0.0001;
        camera.updateProjectionMatrix();
      }
    },
    wire(value: boolean) {
      root?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh)
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
            if ('wireframe' in m) m.wireframe = value;
      });
    },
    lighting(value: string) {
      renderer.toneMappingExposure = value === 'bright' ? 1.65 : value === 'soft' ? 0.85 : 1.15;
      sun.intensity = value === 'soft' ? 0.8 : 2.4;
    },
    clip(index: number) {
      mixer?.stopAllAction();
      if (clips[index]) mixer?.clipAction(clips[index]!).play();
    },
    pause(value: boolean) {
      running = !value;
    },
    dispose() {
      cancelMeasurement('The viewport closed before measurement finished.');
      disposed = true;
      generation++;
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('keydown', keyDown);
      renderer.domElement.removeEventListener('keyup', keyUp);
      renderer.domElement.removeEventListener('blur', clearKeys);
      if (root) disposeModel(root);
      environment.dispose();
      renderer.dispose();
      container.replaceChildren();
    },
  };
}
