import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { REVIEW_RIG } from '../src/lib/review-rig';
import { applyReviewRig, usesReviewNeutral } from '../src/lib/review-rig-three';

/**
 * Browser side of `verify-viewer-rig.mjs`: renders the rig's calibration chart with the site viewer's own
 * lighting module (`applyReviewRig`, the same call the viewer's React component makes) in a WebGL renderer,
 * and reports the median colour of each patch's central 11x11 pixels, as the rig's own measurements do.
 */

interface ChartCamera {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  halfHeight: number;
  aspect: number;
  near: number;
  far: number;
}
interface ChartGroup {
  name: string;
  camera: ChartCamera;
  samples: { patch: number; roughness: number; center: [number, number] }[];
}
interface ChartRequest {
  /** 'rig' is the viewer's lighting now; 'previous' is the lighting it had before the rig, kept only as a measured comparison. */
  lighting?: 'rig' | 'previous';
  glbUrl: string;
  width: number;
  height: number;
  groups: ChartGroup[];
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
};

/** The viewer's lighting before it followed the rig (room environment .6, two directional lights, Neutral tone mapping, exposure 1). */
function applyPreviousViewerLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  // The old lights sat at multiples of the asset radius: only their directions matter to a directional light.
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(2, 2.6, 1.4);
  const back = new THREE.DirectionalLight(0xffffff, 0.35);
  back.position.set(-1.8, 1, -1.6);
  scene.add(key, back, new THREE.HemisphereLight('#cfd8dd', '#2a221c', 0.25));
  scene.background = new THREE.Color('#aab1bc');
}

async function renderChart({ glbUrl, width, height, groups, lighting = 'rig' }: ChartRequest) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  if (lighting === 'previous') applyPreviousViewerLighting(renderer, scene);
  else applyReviewRig(renderer, scene);
  const gltf = await new GLTFLoader().loadAsync(glbUrl);
  scene.add(gltf.scene);

  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  const context = copy.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

  const results = [];
  for (const group of groups) {
    const { camera: spec } = group;
    const camera = new THREE.OrthographicCamera(-spec.halfHeight * spec.aspect, spec.halfHeight * spec.aspect, spec.halfHeight, -spec.halfHeight, spec.near, spec.far);
    camera.position.set(...spec.position);
    camera.up.set(...spec.up);
    camera.lookAt(new THREE.Vector3(...spec.target));
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    context.drawImage(canvas, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    const samples = group.samples.map(({ patch, roughness, center }) => {
      const channels: number[][] = [[], [], []];
      for (let y = center[1] - 5; y <= center[1] + 5; y++) {
        for (let x = center[0] - 5; x <= center[0] + 5; x++) {
          const at = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) (channels[c] as number[]).push(data[at + c] as number);
        }
      }
      return { patch, roughness, rgb: channels.map(median) };
    });
    const corner = (x: number, y: number) => [...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)];
    results.push({ name: group.name, samples, corners: [corner(0, 0), corner(width - 1, 0), corner(0, height - 1), corner(width - 1, height - 1)], png: copy.toDataURL('image/png') });
  }
  const renderedBy = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  renderer.dispose();
  return { renderedBy, three: THREE.REVISION, usesReviewNeutral, lighting, rig: JSON.parse(JSON.stringify(REVIEW_RIG)), results };
}

(window as unknown as { kilnRigChart: typeof renderChart }).kilnRigChart = renderChart;
