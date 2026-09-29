import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AZIMUTH, frameAsset, orbitDirection } from './viewer-framing';

interface OrbitLike {
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => void;
}

/**
 * Points on the actual surface, in world space, thinned to a fixed budget.
 *
 * The camera has to be placed from the silhouette, and the bounding box is a bad
 * proxy for it: the airship is a slender ellipsoid, so six of its box's eight
 * corners are empty air, and framing to them pushed the camera back far enough
 * that the asset sat in the middle of a lot of nothing. Vertices are what is
 * actually on screen.
 *
 * A stride rather than every vertex, because the fit runs over a full turntable
 * and the answer does not improve past a few thousand samples. Instanced meshes
 * fall back to their bounds -- their per-instance transforms are not in the
 * position attribute -- though nothing the engine emits today is instanced.
 */
function surfacePoints(root: THREE.Object3D, budget = 4000): THREE.Vector3[] {
  root.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  let total = 0;
  for (const m of meshes) total += m.geometry.getAttribute('position')?.count ?? 0;
  const stride = Math.max(1, Math.ceil(total / budget));

  const points: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (const mesh of meshes) {
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const box = new THREE.Box3().setFromObject(mesh);
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z));
      continue;
    }
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) continue;
    for (let i = 0; i < pos.count; i += stride) {
      points.push(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).clone());
    }
  }
  return points;
}

/**
 * Image-based lighting from three's own room scene, rather than an HDR fetched
 * from a CDN. Half of these assets are painted metal and every one of them is
 * lit only by what the environment gives it, so a scene with no environment map
 * shows brushed steel as flat grey and makes the engine look worse than it is.
 * Generating the map in the browser costs a few milliseconds once and nothing
 * after that, and it removes a network dependency from the one thing on the page
 * that has to work.
 */
function Ibl() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.6;
    return () => {
      scene.environment = null;
      target.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Model({
  url,
  wireframe,
  framing,
  onBounds,
  clipIndex,
  paused,
  onClips,
  onReady,
}: {
  url: string;
  onReady: () => void;
  wireframe: boolean;
  framing: number;
  onBounds: (radius: number) => void;
  clipIndex: number;
  paused: boolean;
  onClips: (clips: { id: string; name: string }[]) => void;
}) {
  const { scene, animations } = useGLTF(url);
  useEffect(() => {
    onReady();
    return () => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      useGLTF.clear(url);
    };
  }, [scene, url, onReady]);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  useEffect(() => {
    onClips(animations.map((clip) => ({ id: clip.uuid, name: clip.name })));
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    };
  }, [animations, mixer, scene, onClips]);
  useEffect(() => {
    mixer.stopAllAction();
    const clip = animations[clipIndex];
    if (clip) mixer.clipAction(clip).reset().play();
    return () => {
      mixer.stopAllAction();
    };
  }, [animations, clipIndex, mixer]);
  useFrame((_, delta) => {
    if (!paused) mixer.update(Math.min(delta, 0.1));
  });
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  // The canvas size and not `camera.aspect`, which is still 1 on the frame this
  // first runs, so a wide viewport got framed as though it were square. Reading
  // it here also means turning a phone on its side re-frames instead of cropping.
  const { width, height } = useThree((s) => s.size);

  // Sampled once per asset, not once per reframe: a reset or a resize should not
  // walk every vertex again.
  const points = useMemo(() => surfacePoints(scene), [scene]);

  /**
   * `frustumCulled` off across the board. Several of these programs place parts
   * a long way from the origin -- the airship's mooring mast, the carrier's
   * island -- and three culls against a bounding sphere it computes per mesh, so
   * a part whose geometry was built with a large offset baked into its vertices
   * can blink out at certain angles. Fifty draw calls more is nothing here; a
   * disappearing funnel is not.
   */
  useEffect(() => {
    scene.traverse((o) => {
      o.frustumCulled = false;
    });
  }, [scene]);

  // Frame on load, on every explicit reset, and on resize. The engine's contract
  // puts an asset on Y=0 facing +X, so the camera can be placed from the geometry
  // alone and land on a three-quarter view every time with no per-asset hint.
  //
  // `framing` is not read in the body and is not meant to be: it is a counter
  // the reset button increments, and being in the dependency list is its whole
  // job.
  // biome-ignore lint/correctness/useExhaustiveDependencies: framing is a trigger, not an input.
  useEffect(() => {
    if (!controls) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.001);
    const framed = frameAsset(points, center, size.y, camera.fov, width / height);
    // A little over the exact fit, so nothing ever kisses the edge of the frame.
    const distance = Math.max(framed.distance, 0.01) * 1.04;

    camera.position.copy(framed.target).addScaledVector(orbitDirection(AZIMUTH), distance);
    camera.near = Math.max(distance / 800, 0.005);
    camera.far = distance * 16;
    camera.updateProjectionMatrix();
    controls.target.copy(framed.target);
    // Before `update()`, and imperatively rather than as props on the control:
    // the limits are a function of the bounds, the bounds are only known here,
    // and `update()` clamps to whatever the limits currently say. Passing them
    // as props meant the first frame of every asset was clamped against the
    // previous one's radius -- which framed the airship at 48 metres instead of
    // 109 and cut its mooring mast off the side of the screen.
    controls.minDistance = radius * 0.3;
    controls.maxDistance = radius * 14;
    controls.update();
    onBounds(radius);
  }, [scene, points, camera, controls, framing, onBounds, width, height]);

  useEffect(() => {
    const touched: THREE.Material[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const mat = m as THREE.MeshStandardMaterial;
        mat.wireframe = wireframe;
        touched.push(mat);
      }
    });
    // Restored on the way out because drei caches the loaded scene by URL, and a
    // material left in wireframe would come back that way on the next visit.
    return () => {
      for (const m of touched) (m as THREE.MeshStandardMaterial).wireframe = false;
    };
  }, [scene, wireframe]);

  return <primitive object={scene} />;
}

interface ViewerProps {
  name: string;
  modelUrl: string;
  onError: (error: Error) => void;
}

class ViewerBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    queueMicrotask(() => this.props.onError(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Loading() {
  const { active, progress } = useProgress();
  return active ? (
    <p role="status" className="absolute inset-x-0 top-4 text-center font-mono text-sm">
      Loading GLB: {Math.round(progress)}%
    </p>
  ) : null;
}

function ContextMonitor({ onError }: { onError: (error: Error) => void }) {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const lost = () => onError(new Error('WebGL context lost'));
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [canvas, onError]);
  return null;
}

type CameraCommand = { action: 'left' | 'right' | 'up' | 'down' | 'in' | 'out'; sequence: number };

function KeyboardCamera({ command }: { command: CameraCommand | undefined }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitLike | null;
  useEffect(() => {
    if (!command || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (command.action === 'left') spherical.theta -= 0.15;
    if (command.action === 'right') spherical.theta += 0.15;
    if (command.action === 'up') spherical.phi = Math.max(0.05, spherical.phi - 0.15);
    if (command.action === 'down') spherical.phi = Math.min(Math.PI - 0.05, spherical.phi + 0.15);
    if (command.action === 'in')
      spherical.radius = Math.max(controls.minDistance, spherical.radius * 0.85);
    if (command.action === 'out')
      spherical.radius = Math.min(controls.maxDistance, spherical.radius / 0.85);
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    controls.update();
  }, [command, camera, controls]);
  return null;
}

function Viewer({ name, modelUrl, onError }: ViewerProps) {
  const [wireframe, setWireframe] = useState(false);
  const [grid, setGrid] = useState(true);
  const [spin, setSpin] = useState(false);
  const [framing, setFraming] = useState(0);
  const [radius, setRadius] = useState(4);
  const [ready, setReady] = useState(false);
  const [clips, setClips] = useState<{ id: string; name: string }[]>([]);
  const [clipIndex, setClipIndex] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState<CameraCommand>();
  const onReady = useMemo(() => () => setReady(true), []);
  const move = (action: CameraCommand['action']) =>
    setCommand((previous) => ({ action, sequence: (previous?.sequence ?? 0) + 1 }));
  return (
    <div>
      <section className="relative h-viewer" aria-label={`Interactive ${name} model`}>
        <Canvas
          role="img"
          aria-label={`3D preview of ${name}. Use the controls below to orbit, zoom or inspect.`}
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            toneMapping: THREE.NeutralToneMapping,
            toneMappingExposure: 1,
          }}
          camera={{ fov: 34, position: [6, 3, 5] }}
        >
          <ContextMonitor onError={onError} />
          <Ibl />
          <directionalLight position={[radius * 2, radius * 2.6, radius * 1.4]} intensity={1.25} />
          <directionalLight position={[-radius * 1.8, radius, -radius * 1.6]} intensity={0.35} />
          <hemisphereLight args={['#cfd8dd', '#2a221c', 0.25]} />
          <OrbitControls
            makeDefault
            autoRotate={spin}
            autoRotateSpeed={0.55}
            enableDamping
            dampingFactor={0.06}
          />
          <KeyboardCamera command={command} />
          <Suspense fallback={null}>
            <Model
              url={modelUrl}
              wireframe={wireframe}
              framing={framing}
              onBounds={setRadius}
              clipIndex={clipIndex}
              paused={paused}
              onClips={setClips}
              onReady={onReady}
            />
          </Suspense>
          <ContactShadows
            position={[0, 0.001, 0]}
            scale={radius * 4}
            far={radius * 1.5}
            opacity={0.45}
            blur={2.4}
            resolution={512}
            color="#292d29"
          />
          {grid && (
            <Grid
              args={[radius * 10, radius * 10]}
              cellSize={radius / 5}
              cellColor="#c9c2b5"
              sectionSize={radius}
              sectionColor="#625e55"
              fadeDistance={radius * 9}
              fadeStrength={1.4}
              infiniteGrid
              followCamera={false}
            />
          )}
        </Canvas>
        {!ready && <Loading />}
      </section>
      <section
        className="flex flex-wrap gap-2 border-t border-rule bg-sheet p-4"
        aria-label="3D inspection controls"
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => move('left')}
          aria-label="Orbit left"
        >
          ←
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => move('right')}
          aria-label="Orbit right"
        >
          →
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => move('up')}
          aria-label="Orbit up"
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => move('down')}
          aria-label="Orbit down"
        >
          ↓
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => move('in')}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => move('out')}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={wireframe}
          onClick={() => setWireframe(!wireframe)}
        >
          Wireframe
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={grid}
          onClick={() => setGrid(!grid)}
        >
          Grid
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={spin}
          onClick={() => setSpin(!spin)}
        >
          Rotate
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setSpin(false);
            setFraming((value) => value + 1);
          }}
        >
          Reset view
        </button>
        {clips.length > 0 && (
          <>
            <label className="flex items-center gap-2">
              Animation
              <select
                className="min-h-11 border border-rule bg-sheet px-3 font-mono text-sm"
                value={clipIndex}
                onChange={(event) => {
                  setClipIndex(Number(event.target.value));
                  setPaused(false);
                }}
              >
                <option value={-1}>Rest pose</option>
                {clips.map((clip, index) => (
                  <option key={clip.id} value={index}>
                    {clip.name === 'ArticulationProbe' ? `${clip.name} (inspection)` : clip.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={clipIndex < 0}
              onClick={() => setPaused(!paused)}
            >
              {paused ? 'Play animation' : 'Pause animation'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

export function mountAssetViewer(element: HTMLElement, props: ViewerProps) {
  // Check before React/Three initialize a renderer, so the fallback does not leave a failed canvas.
  const probe = document.createElement('canvas');
  const context = probe.getContext('webgl2');
  if (!context) throw new Error('WebGL2 is unavailable');
  context.getExtension('WEBGL_lose_context')?.loseContext();
  const root = createRoot(element);
  root.render(
    <ViewerBoundary onError={props.onError}>
      <Viewer {...props} />
    </ViewerBoundary>,
  );
  return () => root.unmount();
}
