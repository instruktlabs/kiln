// Golden Gate M0: proves the renderer features the water and traffic designs depend on,
// on three 0.186.0, through the kit's own renderer factory (both backends).
// Cases: TSL SkyMesh + PMREM environment, TSL reflector with layer exclusion,
// scene-depth reads under MSAA, per-instance colour on node materials, RG16F data textures.
import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  BoxGeometry, Color, DataTexture, DoubleSide, Group, HalfFloatType, InstancedMesh, LinearFilter, Matrix4, Mesh,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, NeutralToneMapping, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
  RGFormat, Scene, SphereGeometry, Vector3, ClampToEdgeWrapping,
} from 'three/webgpu';
import type { WebGPURenderer, RenderTarget } from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { reflector, viewportDepthTexture, perspectiveDepthToViewZ, positionView, cameraNear, cameraFar, texture, uv, vec3, vec2, float, clamp } from 'three/tsl';
import { SceneRoot, useSceneBuilt, useBuilt, useRegisterTestHooks, defineTiers, asWebGPU } from '@kiln-scenes/scene-kit';
import type { SceneDefinition, SceneProps, TierKnobs } from '@kiln-scenes/scene-kit';
import { halfFloatLut } from '../src/world/png16';

const knobs: TierKnobs = {
  pixelRatioCap: 1, pixelRatioMin: 1, shadows: { enabled: false, type: 'pcf', mapSize: 1024, maxCasters: 1 },
  vegetationDensity: 0, instanceDensity: 1,
  drawDistance: { far: 40000, fogNear: 30000, fogFar: 40000, lodBias: 1, streamRadiusScale: 1, zoneHops: 0 },
  effects: { water: 'full', wind: false, ambientAnimation: false },
};
const definition: SceneDefinition = {
  id: 'golden-gate-m0', label: 'Golden Gate M0 feature fixture', description: 'Renderer feature checks for the Golden Gate scene.',
  camera: { position: [0, 2, 0], fov: 50, near: .5, far: 40000 },
  tiers: defineTiers({ order: ['minimal', 'economy', 'balanced', 'high'], minimal: knobs, economy: knobs, balanced: knobs, high: knobs }),
  look: { toneMapping: NeutralToneMapping, exposure: 1, background: 0x000000 },
};

/** Named camera poses: [position, target]. Regions sit 1 km apart so each case is isolated. */
export const M0_CASES = {
  sky: { position: [0, 2, 0], target: [0, 3.2, -10] },
  reflector: { position: [1000, 7, 14], target: [1000, 0, -4] },
  depth: { position: [2000, 9, 16], target: [2000, 0, -8] },
  instances: { position: [3000, 1.5, 11], target: [3000, 1, 0] },
  halfFloat: { position: [4000, 0, 9], target: [4000, 0, 0] },
} as const;
export const INSTANCE_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#202020'];

function build(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera) {
  const root = new Group(); root.name = 'gg-m0';
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(value: T) => { disposables.push(value); return value; };
  camera.layers.enable(2);

  // Sky: TSL SkyMesh with clouds disabled (its cloud branch reads TSL time; coverage 0 skips it).
  const sky = new SkyMesh(); sky.name = 'sky'; sky.scale.setScalar(20000);
  sky.cloudCoverage.value = 0; sky.turbidity.value = 3; sky.rayleigh.value = 1.2; sky.mieCoefficient.value = .005; sky.mieDirectionalG.value = .8;
  const sun = new Vector3().setFromSphericalCoords(1, Math.PI / 2 - 25 * Math.PI / 180, Math.PI); // 25 degrees up, toward -Z
  sky.sunPosition.value.copy(sun);
  own(sky.geometry); own(sky.material);
  // Environment from the sky alone: PMREM of a scene containing only the sky mesh.
  const pmrem = new PMREMGenerator(renderer), skyScene = new Scene();
  skyScene.add(sky);
  const envTarget: RenderTarget = pmrem.fromScene(skyScene, 0, .1, 30000);
  pmrem.dispose(); scene.environment = envTarget.texture; scene.environmentIntensity = 1;
  own(envTarget);
  root.add(sky);

  // A: environment-lit white sphere (no lights exist in this fixture).
  const sphereGeometry = own(new SphereGeometry(1.2, 48, 24));
  const sphereMaterial = own(new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }));
  const sphere = new Mesh(sphereGeometry, sphereMaterial); sphere.position.set(0, 3.2, -10); root.add(sphere);

  // B: planar reflector at y=0; red box on layer 0 (reflected), green box on layer 2 only (excluded).
  const reflection = reflector({ resolutionScale: .5 });
  reflection.target.rotateX(-Math.PI / 2); reflection.target.position.set(1000, 0, 0); root.add(reflection.target);
  reflection.uvNode = reflection.uvNode!.add(vec2(0, .002)); // distortion hook used by the water normal
  const virtualCamera = reflection.reflector.getVirtualCamera(camera); virtualCamera.layers.set(0);
  const mirrorMaterial = own(new MeshBasicNodeMaterial()); mirrorMaterial.colorNode = reflection.rgb.mul(.9);
  const mirror = new Mesh(own(new PlaneGeometry(40, 40)), mirrorMaterial); mirror.rotation.x = -Math.PI / 2; mirror.position.set(1000, 0, 0); root.add(mirror);
  const boxGeometry = own(new BoxGeometry(2, 2, 2));
  const red = new Mesh(boxGeometry, own(new MeshBasicNodeMaterial({ color: 0xff0000 }))); red.position.set(997, 2, -6); root.add(red);
  const green = new Mesh(boxGeometry, own(new MeshBasicNodeMaterial({ color: 0x00ff00 }))); green.position.set(1003, 2, -6); green.layers.set(2); root.add(green);

  // C: sloped opaque floor under a transparent plane that shades its own thickness from scene depth.
  const slope = new Mesh(own(new PlaneGeometry(30, 50)), own(new MeshBasicNodeMaterial({ color: 0x404040 })));
  slope.rotation.x = -Math.PI / 2 - Math.atan2(12, 50); slope.position.set(2000, -4, -8); root.add(slope); // rises toward the camera; shoreline near z = 8.6
  const waterMaterial = own(new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide }));
  const sceneViewZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar);
  const thickness = positionView.z.sub(sceneViewZ); // metres along the view axis between surface and floor
  waterMaterial.colorNode = vec3(clamp(thickness.div(12), 0, 1)); waterMaterial.opacityNode = float(1);
  const water = new Mesh(own(new PlaneGeometry(30, 50)), waterMaterial); water.rotation.x = -Math.PI / 2; water.position.set(2000, 0, -8); root.add(water);

  // D: per-instance colour on a node material.
  const instances = new InstancedMesh(own(new BoxGeometry(1, 1, 1)), own(new MeshBasicNodeMaterial({ color: 0xffffff })), INSTANCE_COLORS.length);
  const m = new Matrix4(), c = new Color();
  INSTANCE_COLORS.forEach((hex, i) => { m.makeTranslation(3000 + (i - 3.5) * 1.6, 1, 0); instances.setMatrixAt(i, m); instances.setColorAt(i, c.set(hex)); });
  instances.instanceMatrix.needsUpdate = true; instances.instanceColor!.needsUpdate = true; instances.computeBoundingSphere();
  root.add(instances);

  // E: RG16F (HalfFloatType, RGFormat) data texture built through the water-map LUT path.
  const width = 256, height = 4, data = new Uint16Array(width * height * 2), lut = halfFloatLut(code => code / 65535);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const code = Math.round(x / (width - 1) * 65535), i = (y * width + x) * 2; data[i] = lut[code]!; data[i + 1] = lut[65535 - code]!; }
  const dataTexture = own(new DataTexture(data, width, height, RGFormat, HalfFloatType));
  dataTexture.minFilter = dataTexture.magFilter = LinearFilter; dataTexture.wrapS = dataTexture.wrapT = ClampToEdgeWrapping; dataTexture.generateMipmaps = false; dataTexture.needsUpdate = true;
  const halfMaterial = own(new MeshBasicNodeMaterial()); const sample = texture(dataTexture, uv());
  halfMaterial.colorNode = vec3(sample.r, sample.g, 0);
  const halfPlane = new Mesh(own(new PlaneGeometry(8, 4)), halfMaterial); halfPlane.position.set(4000, 0, 0); root.add(halfPlane);

  scene.add(root);
  return {
    root, reflection, virtualCamera,
    dispose() {
      root.removeFromParent(); scene.environment = null; camera.layers.disable(2);
      for (const value of disposables.reverse()) value.dispose();
      reflection.dispose();
    },
  };
}

function M0World() {
  const { gl, scene, camera, size } = useThree();
  const markBuilt = useSceneBuilt();
  const renderer = asWebGPU(gl);
  const built = useBuilt(() => { const value = build(renderer, scene, camera as PerspectiveCamera); markBuilt(true); return value; }, value => value.dispose(), [renderer, scene, camera]);
  const hooks = useMemo(() => ({
    m0Case(name: keyof typeof M0_CASES) {
      const pose = M0_CASES[name]; if (!pose) throw new Error(`Unknown case ${name}`);
      const [px, py, pz] = pose.position, [tx, ty, tz] = pose.target; camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); camera.updateMatrixWorld();
      return name;
    },
    m0Project(point: [number, number, number]) {
      camera.updateMatrixWorld(); const v = new Vector3(point[0], point[1], point[2]).project(camera);
      return [(v.x + 1) / 2 * size.width, (1 - v.y) / 2 * size.height];
    },
    m0Info() {
      const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean; isWebGLBackend?: boolean };
      return { webgpu: !!backend.isWebGPUBackend, webgl: !!backend.isWebGLBackend, samples: renderer.samples, reversedDepthBuffer: renderer.reversedDepthBuffer,
        logarithmicDepthBuffer: renderer.logarithmicDepthBuffer, toneMapping: renderer.toneMapping, environment: !!scene.environment,
        virtualCameraLayers: built?.virtualCamera.layers.mask ?? null, cameraLayers: camera.layers.mask, width: size.width, height: size.height };
    },
  }), [camera, renderer, scene, size, built]);
  useRegisterTestHooks(hooks);
  return null;
}

export function M0Scene(props: SceneProps) { return <SceneRoot options={props} definition={definition}><M0World /></SceneRoot>; }
