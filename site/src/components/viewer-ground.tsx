import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  color,
  distance,
  float,
  fract,
  fwidth,
  min,
  mix,
  pow,
  positionWorld,
  vec2,
  vec3,
} from 'three/tsl';
import { compilesOnPageThread, viewerBackend } from './viewer-renderer';
import { SHADOW_RESOLUTION, composeContactShadow, rebakeDue } from './viewer-draws';

const SHADOW = { opacity: 0.3, blur: 2.4, colour: [0x29, 0x2d, 0x29] as const };

/**
 * The contact shadow, drawn once. A camera under the ground plane sees how close the model comes to the ground; that
 * picture is read back, blurred on the CPU and shown on one plane, so the shadow costs one draw a frame however large
 * the model is. Reading it back rather than blurring on the GPU means the two backends share the code. A playing clip
 * bakes again a few times a second.
 */
export function BakedContactShadow({
  radius,
  ready,
  playing,
  pose,
}: {
  radius: number;
  ready: boolean;
  playing: boolean;
  /** Changes when the pose changes without a clip playing, so the shadow follows it. */
  pose: number;
}) {
  const renderer = useThree((state) => state.gl) as unknown as THREE.WebGPURenderer;
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const plane = useRef<THREE.Mesh>(null);
  const baking = useRef(false);
  const lastBake = useRef(-Infinity);

  const texture = useMemo(() => {
    const data = new Uint8Array(SHADOW_RESOLUTION * SHADOW_RESOLUTION * 4);
    const made = new THREE.DataTexture(data, SHADOW_RESOLUTION, SHADOW_RESOLUTION);
    made.colorSpace = THREE.SRGBColorSpace;
    made.minFilter = THREE.LinearFilter;
    made.magFilter = THREE.LinearFilter;
    made.needsUpdate = true;
    return made;
  }, []);
  const target = useMemo(
    () => new THREE.RenderTarget(SHADOW_RESOLUTION, SHADOW_RESOLUTION, { depthBuffer: true }),
    [],
  );
  const far = radius * 1.5;
  const size = radius * 4;
  const closeness = useMemo(() => {
    // No depth test, as the drei shadow this replaces had: the last surface drawn over a texel sets it, which keeps
    // the shadow light under tall models instead of as dark as whatever comes closest to the ground.
    const material = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
    material.colorNode = vec3(clamp(float(1).sub(positionWorld.y.div(far)), 0, 1));
    material.toneMapped = false;
    return material;
  }, [far]);
  useEffect(() => () => closeness.dispose(), [closeness]);
  useEffect(
    () => () => {
      texture.dispose();
      target.dispose();
    },
    [texture, target],
  );

  const bake = async () => {
    if (baking.current) return;
    baking.current = true;
    const camera = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, far);
    camera.rotation.x = Math.PI / 2;
    camera.updateMatrixWorld();
    /** Runs `step` with the scene set up for the bake, and puts the scene back before anything else can draw. */
    const asBaked = <T,>(step: () => T): T => {
      const before = {
        background: scene.background,
        override: scene.overrideMaterial,
        target: renderer.getRenderTarget(),
        alpha: renderer.getClearAlpha(),
        clear: renderer.getClearColor(new THREE.Color()),
      };
      const ground = plane.current?.parent;
      const groundShown = ground?.visible;
      if (ground) ground.visible = false;
      scene.background = null;
      scene.overrideMaterial = closeness;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      try {
        return step();
      } finally {
        scene.background = before.background;
        scene.overrideMaterial = before.override;
        renderer.setRenderTarget(before.target);
        renderer.setClearColor(before.clear, before.alpha);
        if (ground) ground.visible = groundShown ?? true;
      }
    };
    try {
      // Where the page would wait on them, the bake's own shaders are built first, as the model's are (see `compileAhead`).
      if (compilesOnPageThread(renderer, scene))
        await asBaked(() => renderer.compileAsync(scene, camera)).catch(() => undefined);
      asBaked(() => renderer.render(scene, camera));
    } catch (error) {
      baking.current = false;
      throw error;
    }
    try {
      const read = (await renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        SHADOW_RESOLUTION,
        SHADOW_RESOLUTION,
      )) as Uint8Array;
      const pixels = composeContactShadow(
        uprightRows(read, viewerBackend(renderer)),
        SHADOW_RESOLUTION,
        SHADOW,
      );
      (texture.image.data as Uint8Array).set(pixels);
      texture.needsUpdate = true;
      invalidate();
    } finally {
      baking.current = false;
    }
  };

  // Pausing bakes once more, so the shadow matches the pose the clip stopped on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: bake reads the size and scene these trigger on.
  useEffect(() => {
    if (ready) void bake();
  }, [ready, radius, pose, playing]);

  useFrame(({ clock }) => {
    if (!playing || !ready) return;
    const now = clock.getElapsedTime();
    if (!rebakeDue(now, lastBake.current)) return;
    lastBake.current = now;
    void bake();
  });

  return (
    <mesh ref={plane} position={[0, 0.001, 0]} rotation-x={-Math.PI / 2} scale={[size, size, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/**
 * Row 0 of the shadow's texture is the far (+Z) edge of the plane, which is the top of the bake's picture. WebGPU reads
 * pictures back top row first, WebGL bottom row first.
 */
export function uprightRows(read: Uint8Array, backend: 'webgpu' | 'webgl2'): Uint8Array {
  if (backend === 'webgpu') return read;
  const rowBytes = SHADOW_RESOLUTION * 4;
  const flipped = new Uint8Array(read.length);
  for (let row = 0; row < SHADOW_RESOLUTION; row++) {
    const from = row * rowBytes;
    flipped.set(read.subarray(from, from + rowBytes), (SHADOW_RESOLUTION - 1 - row) * rowBytes);
  }
  return flipped;
}

const gridLines = (cell: number, thickness: number) => {
  const position = vec2(positionWorld.x, positionWorld.z).div(cell);
  const across = abs(fract(position.sub(0.5)).sub(0.5)).div(fwidth(position));
  const line = min(across.x, across.y).add(1 - thickness);
  return float(1).sub(min(line, 1));
};

/**
 * The ground grid: thin cell lines and heavier section lines, fading with distance from the camera. A small plane
 * carried under the camera, with the lines taken from world position so they stay still (see `groundGrid`).
 */
export function GroundGrid({
  args,
  cellSize,
  sectionSize,
  fadeDistance,
  cellColor,
  sectionColor,
  fadeStrength,
}: {
  args: [number, number];
  cellSize: number;
  sectionSize: number;
  fadeDistance: number;
  cellColor: string;
  sectionColor: string;
  fadeStrength: number;
}) {
  const plane = useRef<THREE.Mesh>(null);
  const material = useMemo(() => {
    const made = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cells = gridLines(cellSize, 0.5);
    const sections = gridLines(sectionSize, 1);
    const away = distance(
      vec2(cameraPosition.x, cameraPosition.z),
      vec2(positionWorld.x, positionWorld.z),
    );
    const fade = pow(float(1).sub(min(away.div(fadeDistance), 1)), fadeStrength);
    const alpha = cells.add(sections).mul(fade);
    made.colorNode = mix(color(cellColor), color(sectionColor), min(1, sections));
    made.opacityNode = mix(alpha.mul(0.75), alpha, sections);
    return made;
  }, [cellSize, sectionSize, fadeDistance, cellColor, sectionColor, fadeStrength]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ camera }) => {
    plane.current?.position.set(camera.position.x, 0, camera.position.z);
  });
  return (
    <mesh ref={plane} rotation-x={-Math.PI / 2} material={material} frustumCulled={false}>
      <planeGeometry args={args} />
    </mesh>
  );
}
