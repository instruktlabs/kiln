import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useProgress } from '@react-three/drei/core/Progress';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import {
  DEFAULT_TONE_MAPPING,
  TONE_MAPPINGS,
  type ToneMappingId,
  applyReviewRig,
  applyToneMapping,
  toneMappingChoice,
} from '../lib/review-rig-three';
import {
  AZIMUTH,
  frameAsset,
  groundGrid,
  meshTops,
  orbitDirection,
  type SavedView,
  showView,
  wantsMeshTops,
} from './viewer-framing';
import { clearingOnError } from './viewer-retry';
import { createVehiclePaint, PAINT_SWATCHES } from './vehicle-paint';
import { OrbitControls, clearModel, useModel } from './viewer-controls';
import { restoreCulling, viewerFrameloop } from './viewer-draws';
import { BakedContactShadow, GroundGrid } from './viewer-ground';
import { compileAhead, releaseViewerRenderer, viewerRendererFactory } from './viewer-renderer';

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
  if (wantsMeshTops(total)) points.push(...meshTops(meshes));
  return points;
}

/**
 * The Kiln review lighting rig, applied to the scene: the room environment at the rig's intensity, a hemisphere
 * light and key, fill and rim lights fixed in the world, no shadows, the rig's exposure and tone mapping and its
 * neutral backdrop. These are the values the engine's render service lights every material-review capture with,
 * and the ones the site's posters were rendered under, so an asset looks the same in its poster and here. Half of
 * these assets are painted metal and every one is lit only by what the environment gives it, so the environment
 * is generated in the browser from three's own room scene (a few milliseconds, once) rather than fetched.
 */
function ReviewLighting() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const remove = applyReviewRig(gl, scene);
    invalidate();
    return remove;
  }, [gl, scene, invalidate]);
  return null;
}

/** The tone mapping the visitor chose: the rig's own until they pick another (see `TONE_MAPPINGS`). */
function ToneMapping({ id }: { id: ToneMappingId }) {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    applyToneMapping(gl, scene, id);
    invalidate();
  }, [gl, scene, id, invalidate]);
  return null;
}

function Model({
  url,
  wireframe,
  framing,
  viewShowing,
  onBounds,
  clipIndex,
  paused,
  onClips,
  onReady,
  paintAssetId,
  paintColour,
  onPaintReady,
}: {
  url: string;
  onReady: () => void;
  wireframe: boolean;
  framing: number;
  viewShowing: { current: boolean };
  onBounds: (radius: number) => void;
  clipIndex: number;
  paused: boolean;
  onClips: (clips: { id: string; name: string }[]) => void;
  paintAssetId?: string;
  paintColour: string | null;
  onPaintReady: (originalHex: string | undefined) => void;
}) {
  // No Draco decoder: it would have to be fetched from another host. No shipped GLB uses KHR_draco_mesh_compression,
  // and validate-static fails the build if one ever does.
  const { scene: loadedScene, animations } = useModel(url);
  const paint = useMemo(
    () => createVehiclePaint(loadedScene, paintAssetId),
    [loadedScene, paintAssetId],
  );
  const scene = paint?.scene ?? loadedScene;
  useEffect(() => onPaintReady(paint?.originalHex), [paint, onPaintReady]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    paint?.setColour(paintColour);
    invalidate();
  }, [paint, paintColour, invalidate]);
  useEffect(() => {
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
      clearModel(url);
    };
  }, [scene, url]);
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
    invalidate();
    return () => {
      mixer.stopAllAction();
    };
  }, [animations, clipIndex, mixer, invalidate]);
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

  // Several of these programs place parts a long way from the origin -- the airship's mooring mast, the carrier's
  // island -- with the offset baked into their vertices. Measuring each sphere from those vertices keeps them in
  // view; on a model of thousands of parts, culling is what stops every part being drawn from inside the nave.
  useEffect(() => {
    restoreCulling(scene);
    invalidate();
  }, [scene, invalidate]);

  // Frame on load, on every explicit reset, and on resize. The engine's contract
  // puts an asset on Y=0 facing +X, so the camera can be placed from the geometry
  // alone and land on a three-quarter view every time with no per-asset hint.
  //
  // `framing` is not read in the body and is not meant to be: it is a counter
  // the reset button increments, and being in the dependency list is its whole
  // job.
  // biome-ignore lint/correctness/useExhaustiveDependencies: framing is a trigger, not an input.
  useEffect(() => {
    if (!controls || viewShowing.current) return;
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
    invalidate();
  }, [scene, points, camera, controls, framing, viewShowing, onBounds, width, height, invalidate]);

  // The model joins the view once its shaders are built, and the view counts as ready from then (see `compileAhead`).
  const renderer = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
  const root = useThree((s) => s.scene);
  const [compiled, setCompiled] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let live = true;
    compileAhead(renderer, scene, camera, root)
      .catch(() => undefined)
      .then(() => {
        if (live) setCompiled(scene);
      });
    return () => {
      live = false;
    };
  }, [renderer, scene, camera, root]);
  const shown = compiled === scene;
  useEffect(() => {
    if (!shown) return;
    onReady();
    invalidate();
  }, [shown, onReady, invalidate]);

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
    invalidate();
    // Restored on the way out because drei caches the loaded scene by URL, and a
    // material left in wireframe would come back that way on the next visit.
    return () => {
      for (const m of touched) (m as THREE.MeshStandardMaterial).wireframe = false;
    };
  }, [scene, wireframe, invalidate]);

  return shown ? <primitive object={scene} /> : null;
}

interface ViewerProps {
  name: string;
  modelUrl: string;
  onError: (error: Error) => void;
  paintAssetId?: string;
  /** Saved cameras to offer as buttons. Most models have none. */
  views?: SavedView[];
  /** Skip WebGPU, as a browser without it would: for checks of the fallback. */
  forceWebGL?: boolean;
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

/** Reports a lost GPU, on either backend, and releases the renderer when the view closes. */
function RendererMonitor({ onError }: { onError: (error: Error) => void }) {
  const renderer = useThree((state) => state.gl) as unknown as THREE.WebGPURenderer;
  useEffect(() => {
    const canvas = renderer.domElement;
    let closing = false;
    const lost = () => {
      if (!closing) onError(new Error('The graphics device was lost'));
    };
    canvas.addEventListener('webglcontextlost', lost);
    renderer.onDeviceLost = lost;
    return () => {
      closing = true;
      canvas.removeEventListener('webglcontextlost', lost);
      void releaseViewerRenderer(renderer);
    };
  }, [renderer, onError]);
  return null;
}

type CameraCommand =
  | { action: 'left' | 'right' | 'up' | 'down' | 'in' | 'out'; sequence: number }
  | { action: 'view'; view: SavedView; sequence: number };

function KeyboardCamera({ command }: { command: CameraCommand | undefined }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitLike | null;
  useEffect(() => {
    if (!command || !controls) return;
    if (command.action === 'view') {
      showView(camera, controls.target, command.view);
      controls.update();
      return;
    }
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

function Viewer({ name, modelUrl, onError, paintAssetId, views, forceWebGL }: ViewerProps) {
  const renderer = useMemo(() => viewerRendererFactory({ forceWebGL }), [forceWebGL]);
  const [wireframe, setWireframe] = useState(false);
  const [grid, setGrid] = useState(true);
  const [spin, setSpin] = useState(false);
  const [framing, setFraming] = useState(0);
  const [radius, setRadius] = useState(4);
  const [ready, setReady] = useState(false);
  const [clips, setClips] = useState<{ id: string; name: string }[]>([]);
  const [clipIndex, setClipIndex] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [toneMapping, setToneMapping] = useState<ToneMappingId>(DEFAULT_TONE_MAPPING);
  const [command, setCommand] = useState<CameraCommand>();
  const [paintColour, setPaintColour] = useState<string | null>(null);
  const [originalPaint, setOriginalPaint] = useState<string>();
  const onReady = useMemo(() => () => setReady(true), []);
  const move = (action: Exclude<CameraCommand['action'], 'view'>) =>
    setCommand((previous) => ({ action, sequence: (previous?.sequence ?? 0) + 1 }));
  // A saved camera stays until reset: refitting the whole model on a resize or a phone's turn would throw it back outside.
  const viewShowing = useRef(false);
  const look = (view: SavedView) => {
    viewShowing.current = true;
    setSpin(false);
    setCommand((previous) => ({ action: 'view', view, sequence: (previous?.sequence ?? 0) + 1 }));
  };
  return (
    <div>
      <section className="relative h-viewer" aria-label={`Interactive ${name} model`}>
        <Canvas
          role="img"
          aria-label={`3D preview of ${name}. Use the controls below to orbit, zoom or inspect.`}
          dpr={[1, 1.5]}
          frameloop={viewerFrameloop({ spin, clipPlaying: clipIndex >= 0 && !paused })}
          gl={renderer as never}
          camera={{ fov: 34, position: [6, 3, 5] }}
        >
          <RendererMonitor onError={onError} />
          <ReviewLighting />
          <ToneMapping id={toneMapping} />
          <OrbitControls autoRotate={spin} autoRotateSpeed={0.55} dampingFactor={0.06} />
          <KeyboardCamera command={command} />
          <Suspense fallback={null}>
            <Model
              url={modelUrl}
              wireframe={wireframe}
              framing={framing}
              viewShowing={viewShowing}
              onBounds={setRadius}
              clipIndex={clipIndex}
              paused={paused}
              onClips={setClips}
              onReady={onReady}
              paintAssetId={paintAssetId}
              paintColour={paintColour}
              onPaintReady={setOriginalPaint}
            />
          </Suspense>
          <group>
            <BakedContactShadow
              radius={radius}
              ready={ready}
              playing={clipIndex >= 0 && !paused}
              pose={clipIndex}
            />
            {grid && (
              <GroundGrid
                {...groundGrid(radius)}
                cellColor="#9ba4b0"
                sectionColor="#7b8492"
                fadeStrength={1.4}
              />
            )}
          </group>
        </Canvas>
        {!ready && <Loading />}
      </section>
      {originalPaint && (
        <div className="border-t border-rule bg-sheet p-4">
          <fieldset className="min-w-0" data-paint-palette>
            <legend className="mb-3 p-0 font-semibold">Body paint</legend>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                aria-pressed={paintColour === null}
                onClick={() => setPaintColour(null)}
              >
                Original paint
              </button>
              {PAINT_SWATCHES.map(({ name: colourName, hex }) => (
                <button
                  key={hex}
                  type="button"
                  className="btn btn-secondary gap-2"
                  aria-label={`${colourName} body paint`}
                  aria-pressed={paintColour === hex}
                  onClick={() => setPaintColour(hex)}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-5 w-5 rounded-full border border-rule"
                    style={{ backgroundColor: hex }}
                  />
                  {colourName}
                </button>
              ))}
              <label className="flex min-h-11 items-center gap-2 px-2">
                Custom colour
                <input
                  type="color"
                  aria-label="Custom body paint colour"
                  className="h-11 w-12 cursor-pointer"
                  value={paintColour ?? originalPaint}
                  onInput={(event) => setPaintColour(event.currentTarget.value)}
                  onChange={(event) => setPaintColour(event.target.value)}
                />
              </label>
            </div>
            <p className="mt-3 text-caption text-dim">
              Explore different body colours. The GLB download keeps its original paint.
            </p>
          </fieldset>
        </div>
      )}
      <section
        className="flex flex-wrap gap-2 border-t border-rule bg-sheet p-4"
        aria-label="3D inspection controls"
      >
        {views?.map((view) => (
          <button
            key={view.label}
            type="button"
            className="btn"
            disabled={!ready}
            onClick={() => look(view)}
          >
            {view.label}
          </button>
        ))}
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
          <span aria-hidden="true">{wireframe ? '✓ ' : ''}</span>Wireframe
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={grid}
          onClick={() => setGrid(!grid)}
        >
          <span aria-hidden="true">{grid ? '✓ ' : ''}</span>Grid
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={spin}
          onClick={() => setSpin(!spin)}
        >
          <span aria-hidden="true">{spin ? '✓ ' : ''}</span>Rotate
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setSpin(false);
            viewShowing.current = false;
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
        <label className="flex items-center gap-2">
          Tone mapping
          <select
            data-tone-mapping
            className="min-h-11 border border-ink bg-sheet px-3 font-mono text-sm"
            value={toneMapping}
            onChange={(event) => setToneMapping(toneMappingChoice(event.target.value).id)}
          >
            {TONE_MAPPINGS.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      </section>
    </div>
  );
}

export function mountAssetViewer(element: HTMLElement, props: ViewerProps) {
  // Check before React/Three initialize a renderer, so the page's fallback does not leave a failed canvas. A browser
  // with WebGPU can still lack an adapter, so WebGL2 is what proves the view can draw when `navigator.gpu` is absent.
  if (!('gpu' in navigator)) {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2');
    if (!context) throw new Error('Neither WebGPU nor WebGL2 is available');
    context.getExtension('WEBGL_lose_context')?.loseContext();
  }
  const onError = clearingOnError(props.modelUrl, props.onError, clearModel);
  const root = createRoot(element);
  root.render(
    <ViewerBoundary onError={onError}>
      <Viewer {...props} onError={onError} />
    </ViewerBoundary>,
  );
  return () => root.unmount();
}
