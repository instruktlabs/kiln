# scene-kit

Shared React Three Fiber foundation for independently mounted scenes. This package is private and ships TypeScript source for a host build. Its standalone demo bundles React and the renderer into static files.

Read the milestone state in [PROGRESS.md](../../PROGRESS.md). The consumer release gate is the explicit `KIT-M1: READY <date>` entry there; this README is not a readiness declaration. [SPEC.md](../../SPEC.md) and [DECISIONS.md](../../DECISIONS.md) remain normative. Add requests for compatible kit extensions to the workspace `KIT-REQUESTS.md` after M1.

## Run the demo

From the workspace root, with the pinned Bun 1.4.2 toolchain and the existing lockfile:

```powershell
bun run check:toolchain
bun run check:pins
bun run typecheck
bun test
bun run demo:build
bun run demo:serve
```

Open `http://127.0.0.1:4400/`. Stop the foreground server with Ctrl+C when finished. The server verifies the staged demo assets before serving. `demo:build` creates `packages/scene-kit/dist/standalone/`, `dist/test/`, and `dist/dev/`; each contains its own `serve.mjs`. A copied standalone directory needs Node to serve it and no package installation.

`bun run test:browser` owns its Chrome processes and loopback servers. It performs correctness, resource-count and byte checks. Timing qualification belongs on an idle qualification machine, following the owner’s run kit; local frame-time numbers must not be used as performance evidence.

## Host build configuration

Use the pinned single copies of `react` / `react-dom` 19.3.0, `@react-three/fiber` 9.8.1 and `three` / `@types/three` 0.186.0. Do not add drei or a second three build. The source configuration supplies the required aliases, deduplication and explicit public/test/dev constants:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { sceneSourceConfig } from '@kiln-scenes/scene-kit/build';

export default defineConfig(sceneSourceConfig('public'));
```

For an existing host, merge these settings into its Vite configuration while retaining its other plugins and aliases. The exported `THREE_RUNTIME_FACADE` and `SCENE_DEDUPE` are available when the host needs to assemble the equivalent settings itself.

The facade maps the bare `three` import to the same `three/webgpu` build used by the kit. It adapts R3F’s legacy `Clock` dependency to r186 `Timer`, avoiding deprecated-clock diagnostics. It does not fork R3F, modify three, or create a second renderer implementation. Scene code imports renderer classes and materials from `three/webgpu`, node functions from `three/tsl`, and helpers from `three/addons/*`.

## Scene component and mount contract

The required page-facing props stay:

```ts
interface SceneOptions {
  assetBase: string;
  onReady?: () => void;
  onError?: (error: Error) => void;
}
```

`SceneProps` additionally permits `quality`, `backend`, `dev`, `onProgress`, `onBackend`, `onTier` and `onPlayChange`. The page owns the container, loading/error presentation, fullscreen, exit and unmount. A zero-size container is valid; initialization waits until it has a nonzero size. `onReady` fires once after complete content has been submitted; a fatal `SceneError` reaches `onError` once, with no later readiness callback.

```tsx
import { useEffect } from 'react';
import { BoxGeometry, Mesh, MeshStandardNodeMaterial, NeutralToneMapping } from 'three/webgpu';
import {
  SceneRoot, mountScene, defineTiers, useBuilt, disposeObject3D,
  useSceneBuilt, useSceneClock, useSystem, SystemOrder, OrbitRig,
  type SceneDefinition, type SceneProps, type TierKnobs,
} from '@kiln-scenes/scene-kit';

const high: TierKnobs = {
  pixelRatioCap: 1.5, pixelRatioMin: 1,
  shadows: { enabled: false, type: 'basic', mapSize: 512, maxCasters: 0 },
  vegetationDensity: 1, instanceDensity: 1,
  drawDistance: { far: 250, fogNear: 120, fogFar: 220, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 },
  effects: { water: 'off', wind: false, ambientAnimation: true },
};
const definition: SceneDefinition = {
  id: 'example', label: 'Interactive example',
  description: 'Drag to orbit. Tab moves through the controls.',
  tiers: defineTiers({ order: ['economy', 'balanced', 'high'],
    economy: { ...high, pixelRatioCap: .75, pixelRatioMin: .6 },
    balanced: { ...high, pixelRatioCap: 1, pixelRatioMin: .75 }, high }),
  look: { toneMapping: NeutralToneMapping, exposure: 1, background: 0xa8c5d5 },
  camera: { position: [4, 3, 6], fov: 40 },
};
function Content() {
  const clock = useSceneClock(), markBuilt = useSceneBuilt();
  const mesh = useBuilt(
    () => new Mesh(new BoxGeometry(), new MeshStandardNodeMaterial({ color: 0x80baaa })),
    disposeObject3D,
    [],
  );
  useEffect(() => { markBuilt(!!mesh); return () => markBuilt(false); }, [mesh, markBuilt]);
  useSystem('example-rotation', SystemOrder.sim, () => {
    if (mesh) mesh.rotation.y = clock.ambient * .15;
  });
  return <>{mesh && <primitive object={mesh} dispose={null} />}
    <ambientLight intensity={2} /><OrbitRig target={[0, 0, 0]} />
  </>;
}
export function ExampleScene(props: SceneProps) {
  return <SceneRoot options={props} definition={definition}><Content /></SceneRoot>;
}
export const mountExample = (element: HTMLElement, props: SceneProps) =>
  mountScene(element, ExampleScene, props);
```

Supply an `assetBase` containing a valid `kiln.scene-pack/1` manifest, even for a procedural scene. `SceneRoot` verifies and loads the eager pack before mounting scene content. `mountExample(element, props)` returns an idempotent `unmount()` handle. Declarative `<ExampleScene />` also releases its resources on React unmount.

Inside scene content, `useLoadedPack()` returns that verified eager pack and `usePackReader()` returns its reader for deferred files and cells. These hooks reuse the root’s completed load:

```tsx
import { useLoadedPack, usePackReader } from '@kiln-scenes/scene-kit/assets';

function BridgeModel() {
  const pack = useLoadedPack();
  const bridge = pack.models.get('bridge');
  return bridge ? <primitive object={bridge.scene} dispose={null} /> : null;
}
// In a streamed-world component:
// const reader = usePackReader();
// useCellStreamer({ ..., load: (cell, signal) => reader.loadGlb(pathFor(cell), signal), ... });
```

The root owns eager pack resources; mounting those models uses `dispose={null}`. Clones can share their geometry, materials and textures, so do not dispose those shared resources from a clone's cleanup. A streamed cell owns its separately loaded resources and must register their cleanup with the cell's disposal registry.

`disposeLoadedModels()` releases each distinct geometry, material, texture, skeleton and image bitmap once per call. If a disposal callback throws, it still attempts the remaining resources, then throws an `AggregateError`; teardown owners should record that error while completing their other cleanup. A loading failure retains its asset error code and message, with any additional cleanup failure included in its cause.

Create disposable GPU resources inside `useBuilt` or effects. `disposeObject3D` disposes owned geometry, materials and textures; use its `skipShared` option for resources owned elsewhere. Resources are terminal after disposal. Do not dispose a memoized GPU object and reuse it after a StrictMode remount.

## Clock, systems and input

The kit owns the only R3F `useFrame` registration. Add imperative work with `useSystem(name, order, fn)`. The callback’s `dt` is unscaled and capped at 0.1 seconds, suitable for player input, vehicles and camera response. `useSceneClock().time` drives simulation playback; `.ambient` also freezes under reduced motion. Node materials use `createTimeNode(clock, 'ambient')`. Do not use wall-clock time or TSL’s built-in `time` for visible scene animation.

Use `InputProvider`, `useInput`, `VirtualJoystick` and `TouchButtons` for root-scoped keyboard/pointer handling and named actions. For driving on touch (D-22), `VirtualJoystick axes="throttle"` is the only driving input: `move.y` is a signed throttle (forward accelerates, back brakes or reverses) and `move.x` steers, each with its own dead zone. Pinch and the wheel accumulate into `input.state.zoom` each frame. Native HUD controls keep their keyboard behavior. Tab is never captured; Escape leaves play before a subsequent Escape can reach the page. `OrbitRig` and `FollowRig` scope their OrbitControls listeners to the scene root and canvas, including the addon’s pointer-capture and Control-key tracking.

`usePlayMode()` exposes the root’s shared `{ playing, setPlaying }` state. Use it to drive the scene’s simulation, camera mode and HUD together, so Enter on the root and the first Escape control the same mode. `useSceneRootRef()` exposes the focus target and the element for any additional scene-local listeners:

```tsx
import { usePlayMode, useSceneRootRef, HudButton } from '@kiln-scenes/scene-kit';

function PlayButton() {
  const { playing, setPlaying } = usePlayMode();
  const sceneRoot = useSceneRootRef();
  return <HudButton onClick={() => {
    setPlaying(!playing);
    sceneRoot.current?.focus({ preventScroll: true });
  }}>{playing ? 'Back to overview' : 'Walk the scene'}</HudButton>;
}
```

`SceneRoot` already supplies the normal root input bindings. To declare extra named actions, call `useInput().configureActions(...)` in an effect. Avoid wrapping the same root in another `InputProvider`, which would duplicate its bindings.

`PathRig` provides linear or centripetal Catmull-Rom paths, seeking and interruption. On interruption, activate `OrbitRig` and pass the supplied pose to `rigRef.current.setView(pose)` for a continuous hand-back. `VehicleRig` uses a critically damped chase camera and five obstruction rays. The demo shows all four rigs and a BVH-backed capsule, door and vehicle.

## Quality and the r186 DPR fallback

`defineTiers` accepts a static entry or `(device: DeviceClass) => knobs`. Device classification selects the initial structural tier. `useQuality()` exposes that tier, the stable `live` object, its current ladder level and reduced-motion policy. Subscribe with `onLiveChange` when a density change should immediately update an instance count or streamer setting.

**Pixel ratio is startup-only on both backends.** M0 B-00e failed; Z4 therefore applies. `DYNAMIC_DPR_SUPPORTED` is `false`. `buildLadder` removes pixel-ratio changes, including from custom ladders. `QualityController.setLive` also ignores a pixel-ratio patch. Changing scene quality requires a remount for new structural settings; never call R3F `setDpr` from a consumer’s live governor.

The governor ignores warmup/settling, hidden/paused intervals and isolated stalls. A downgrade that fails to improve the median by 8 percent is reverted. A constant slow trace therefore does not justify repeated quality cuts; the floor-reaching test uses an improving trace under C-02. C-01 preserves the Farm high-tier ratio floor of 1.0.

Under D-05, automatic classification, Save-Data adjustments, persisted learning and downgrade advice select `minimal` only for mobile WebGL2 devices (D-03). Other devices retain an automatic floor of `economy` when that tier exists. An explicit `quality="minimal"` prop still overrides automatic selection, preserving the page-facing contract.

The default ladder first reduces vegetation, then LOD distance, streaming radius and instance density. Scenes may supply a custom ladder containing their permitted live levels. Shadow configuration, far/fog distances and water material variants remain structural.

`multisample.discard` is structural too (OD-10). The default is store. Set it only for a WebGPU tier whose main pass is never split by a framebuffer copy (viewport depth or texture nodes, transmission). The 4x canvas attachments are then resolved and discarded, and three creates them transient. Anything that would load or store them trips the policy back to store for the mount; in test and dev builds a trip is a fatal `SceneError` with code `msaa-discard`.

## Modules and build boundaries

| Entry | Main APIs |
|---|---|
| `contract` | `SceneRoot`, `mountScene`, `SceneError`, `useSceneBuilt`, `usePlayMode`, `useSceneRootRef` |
| `lifecycle` | `DisposeRegistry`, `useBuilt`, `useSystem`, `useSceneClock`, `createTimeNode` |
| `renderer`, `look` | `RendererLook`, `configureRenderer`, `useBackend`, `usePresets` |
| `assets` | `useLoadedPack`, `usePackReader`, `loadPack`, `createPackReader`, `fetchVerified`, `poolTextures` |
| `quality` | `defineTiers`, `useQuality`, classification, ladders and governor |
| `instancing` | Tangent-safe geometry, batches, frame graph, `InstancedGroup`, streaming and zones |
| `input`, `camera`, `collision` | Actions and touch controls, rigs, BVH world and capsule mover |
| `ui` | HUD primitives, controls help, credits, fade and developer panel |
| `testing` | Test hooks, workloads, dev parameters and frame recorder |
| `staging` | **Node only:** `stageFiles`, `readZip`, `verifyStaged` |
| `build` | **Node only:** Vite source and standalone presets |
| `testing/node` | **Node only:** owned Chrome/server helpers, contract suite and perf runner |

Browser imports resolve to `src/index.browser.ts`; Node/build imports also expose staging/build APIs. Keep Node-only subpaths out of scene component modules. The `public` build removes test globals and developer UI and ignores URL flags. `test` exposes `window.__kilnScene`; `dev` also permits `DevPanel` when the page supplies `dev: true`.

Under DECISIONS C-03, React DOM 19.3.0 retains one shared nonpassive document `selectionchange` listener for the page lifetime. Scene teardown removes every scene-owned listener; the contract suite verifies that this single React infrastructure listener, identified by its document marker, never grows across mounts. Do not remove it or intercept document methods. The pinned source locations and cold-mount evidence are recorded in `evidence/m1/stop-rule-03.md` and REPORT's website handoff.

Farm keeps its ACES Filmic appearance. Golden Gate and Foundry Floor use Neutral under D-18, with AgX reserved for the documented fallback. Consult the M0 tone-map evidence in PROGRESS before changing a scene’s authored look. Presets blend exposure, linear color components and other numbers while keeping tone mapping and fog kind fixed.

`mergeRigidByMaterial(root, { isAnchor })` (in `instancing`) merges rigid parts by material inside each anchor: the nearest `isAnchor` ancestor, with the root always counting. Anchors keep their identity, transform and children, and the merged meshes become their children with identity transforms. Sources stay in the graph, hidden, so name lookups, mixers and colliders keep working, and `restore()` undoes the merge. These are never merged: transparent, multi-material, skinned, morphed, instanced, hidden and extras-carrying meshes, and parts that carry tangents and are mirrored against their anchor. An optional `cache` with `cacheKey` lets identical placements share merged geometry. `bakeRigidGeometry(meshes, anchor, { attributes: 'position' })` makes the same anchor-frame bake for material-free stand-ins.

`shadows` holds the opt-in sun-shadow features. `cachedSunShadow({ light, liveMapSize?, settleFrames? })` splits the sun map into a static map, rendered only when armed, and a live map for casters that moved, sampled as `min` through `light.shadow.shadowNode`. Install it before receivers build and keep `castShadow` on. `track(root, { movable })` puts casters on kit layer 30 (`ShadowLayers`; scenes keep 0-29), and casters under `movable` nodes move to layer 31 while they change. Call `update()` every frame at `SystemOrder.shadows` (800), `prime()` when a warm pass starts drawing, and `invalidate(reason)` for static changes the watch cannot see. `shadowOncePerFrame(light)` lets a second camera, such as a planar reflector, reuse the frame's map. `smallCasterThreshold(root, light, { minTexels: 2 })` switches off casters below two shadow texels by the count probe's measure, and `restore()` brings them back. The three r186 behaviour these rely on is pinned in `tests/shadows/shadow-contract.test.ts`.

`shadowStandIns(root, { layer, isAnchor, chunk?, texel?, minCasterTexels? })` bakes eligible casters into one position-only depth proxy per anchor, shadow side and optional x/z cell, with an optional triangle cap. Each proxy is a child of its anchor, so it moves and hides with it. It sits on `layer` only, never on layer 0, so the shadow camera must enable that layer. Its sources stop casting. Small parts can be dropped first, and `stats.skipped` counts each excluded mesh by reason. Build stand-ins after batching. Each proxy copies its anchor's `matrixWorldAutoUpdate`, so a frozen owner stays frozen. For other passes, such as a planar reflection, `mainOnly(roots, layer)` moves drawables off layer 0, and `passStandIn(source, { layer })` adds a coloured clone that shares geometry and materials. `passCameraLayers(camera, { main, pass }, role)` sets just those two bits on each camera. Collision skips both kinds of stand-in.
