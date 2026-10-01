// SPDX-License-Identifier: MIT
// The exterior's sky, environment and lights (FF-C1 item 7, the day preset): a gradient dome from the look's zenith to
// its horizon (the fog colour below the horizon, so the far ground, the fog and the sky meet with no line) that follows
// the camera; the same gradient over the daylit ground rendered once into a PMREM environment, which lights the exported
// PBR materials (the metal claddings reflect it); a sun (directional) and a hemisphere light. The scene's background,
// environment, fog and exposure are saved on build and restored on dispose, so the interior keeps FF2's look.
import { BackSide, BufferAttribute, Color, DirectionalLight, Fog, HemisphereLight, Mesh, MeshBasicMaterial, PMREMGenerator, Scene, SphereGeometry } from 'three/webgpu';
import type { Camera, ColorRepresentation, Group, Node, RenderTarget, Texture, WebGPURenderer } from 'three/webgpu';
import type { CampusLook } from '../data';

/** Vertex colours of a unit sphere: above the horizon from horizon to zenith; below it from the horizon colour at the
 *  horizon to `below` straight down along `belowCurve` (0 paints `below` everywhere under the horizon). */
function paintDome(geometry: SphereGeometry, zenith: Color, horizon: Color, below: Color, belowCurve = 0): void {
  const pos = geometry.attributes.position!, colours = new Float32Array(pos.count * 3), c = new Color();
  for (let k = 0; k < pos.count; k++) {
    const y = pos.getY(k) / Math.max(1e-9, Math.hypot(pos.getX(k), pos.getY(k), pos.getZ(k)));
    if (y >= 0) c.copy(horizon).lerp(zenith, Math.pow(y, 0.55));
    else if (belowCurve > 0) c.copy(horizon).lerp(below, Math.pow(-y, belowCurve));
    else c.copy(below);
    colours[k * 3] = c.r; colours[k * 3 + 1] = c.g; colours[k * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
}

export interface CampusSky {
  readonly sun: DirectionalLight;
  readonly hemisphere: HemisphereLight;
  /** Fog near and far in use (the look's, with far held inside the camera's far plane). */
  readonly fog: { near: number; far: number };
  update(camera: Camera & { far: number }): void;
  dispose(): void;
}

export function createCampusSky(renderer: WebGPURenderer, scene: Scene, lights: Group, look: CampusLook, cameraFar: number): CampusSky {
  const saved = {
    background: scene.background, environment: scene.environment, environmentIntensity: scene.environmentIntensity,
    fog: scene.fog, fogNode: (scene as unknown as { fogNode: Node | null }).fogNode, exposure: renderer.toneMappingExposure,
  };
  const zenith = new Color(look.zenith), horizon = new Color(look.horizon), fogColour = new Color(look.fog.colour), ground = new Color(look.ground);

  // The visible dome: fog colour below the horizon, no fog, no depth, first in render order; it follows the camera.
  const domeGeometry = new SphereGeometry(1, 48, 24);
  paintDome(domeGeometry, zenith, horizon, fogColour);
  const domeMaterial = new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthTest: false, depthWrite: false });
  domeMaterial.name = 'campus-sky';
  const dome = new Mesh(domeGeometry, domeMaterial);
  dome.name = 'campus-sky';
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  scene.add(dome);

  // The environment: the same sky over the lit ground, rendered once. Under the horizon it runs from the horizon colour
  // (the far ground in the fog) to the ground half-mixed with the horizon straight down, so the exported steel
  // claddings (metalness 1) reflect a daylit campus rather than a dark floor.
  const envScene = new Scene(), envGeometry = new SphereGeometry(50, 48, 24);
  paintDome(envGeometry, zenith, horizon, ground.clone().lerp(horizon, 0.5), 0.4);
  const envMaterial = new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false });
  envScene.add(new Mesh(envGeometry, envMaterial));
  const pmrem = new PMREMGenerator(renderer);
  const target: RenderTarget = pmrem.fromScene(envScene, 0.02, 0.1, 100, { size: 256 });
  const environment: Texture = target.texture;

  const sun = new DirectionalLight(look.sun.colour as ColorRepresentation, look.sun.intensity);
  sun.name = 'campus-sun';
  const az = look.sun.azimuthDeg * Math.PI / 180, el = look.sun.elevationDeg * Math.PI / 180;
  // Azimuth is a heading atan2(v, u) (0 = north, 90 = east): the sun direction in (u, y, v) = (x, y, z).
  sun.position.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(1000);
  const hemisphere = new HemisphereLight(look.hemisphere.sky as ColorRepresentation, look.hemisphere.ground as ColorRepresentation, look.hemisphere.intensity);
  hemisphere.name = 'campus-hemisphere';
  lights.add(sun, sun.target, hemisphere);

  const fog = { near: look.fog.near, far: Math.min(look.fog.far, cameraFar * 0.85) };
  scene.background = horizon.clone();
  scene.fog = new Fog(fogColour, fog.near, fog.far);
  (scene as unknown as { fogNode: Node | null }).fogNode = null;
  scene.environment = environment;
  scene.environmentIntensity = look.environmentIntensity;
  renderer.toneMappingExposure = look.exposure;

  return {
    sun, hemisphere, fog,
    update(camera) {
      dome.position.copy(camera.position);
      dome.scale.setScalar(camera.far * 0.9);
      // The sun moves with the camera so its direction stays the look's (a directional light only uses the offset).
      sun.target.position.set(camera.position.x, 0, camera.position.z);
      sun.position.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(1000).add(sun.target.position);
      sun.target.updateMatrixWorld();
    },
    dispose() {
      dome.removeFromParent();
      sun.removeFromParent(); sun.target.removeFromParent(); hemisphere.removeFromParent();
      sun.dispose(); hemisphere.dispose();
      domeGeometry.dispose(); domeMaterial.dispose(); envGeometry.dispose(); envMaterial.dispose();
      target.dispose(); pmrem.dispose();
      scene.background = saved.background; scene.environment = saved.environment; scene.environmentIntensity = saved.environmentIntensity;
      scene.fog = saved.fog; (scene as unknown as { fogNode: Node | null }).fogNode = saved.fogNode;
      renderer.toneMappingExposure = saved.exposure;
    },
  };
}
