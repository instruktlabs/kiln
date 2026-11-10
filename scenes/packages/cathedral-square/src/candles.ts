import { AdditiveBlending, BufferAttribute, Color, DataTexture, Euler, Group, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, PointLight, Quaternion, Sprite, SpriteMaterial, Vector2, Vector3, type Object3D } from 'three/webgpu';
export { createInteriorBounce, interiorBounceWeight, interiorBounceDirection } from './interior-bounce';

const CANDLE_Z = [-1.5, -.9, -.3, .3, .9, 1.5];
/** Existing wax/metal are batched; verify each authored wax tip against the exported stone batch. */
export function findCandleTips(cathedral: Object3D): Vector3[] {
  cathedral.updateWorldMatrix(true, true);
  const wax = cathedral.getObjectByName('Mesh_Sanctuary_Stone') as Mesh | undefined;
  if (!wax?.isMesh) throw new Error('Cathedral candle wax batch is missing');
  const vertices = wax.geometry.getAttribute('position');
  return CANDLE_Z.map(z => {
    // The exported tiny top rings are uncapped: a centre ray falls through them.
    // Measure their actual vertices rather than pretending the open rim is a cap.
    let top = -Infinity, count = 0;
    for (let i = 0; i < vertices.count; i++) {
      if (Math.abs(vertices.getX(i) + 56.6) > .025 || Math.abs(vertices.getZ(i) - z) > .025) continue;
      const y = vertices.getY(i); if (y < 2.4 || y > 2.7) continue;
      top = Math.max(top, y); count++;
    }
    if (count < 10 || top < 2.55) throw new Error(`Cathedral candle tip is missing at z=${z}`);
    return new Vector3(-56.6, top, z).applyMatrix4(wax.matrixWorld);
  });
}

/** Deterministic low-amplitude movement; no random/global time and no strobe. */
export function candlePulse(time: number, index: number, reduced: boolean): number {
  return reduced ? 1 : 1 + .028 * Math.sin(time * 2.7 + index * 1.73) + .017 * Math.sin(time * 5.1 + index * 2.31);
}
function flameGeometry(core: boolean) {
  const height = core ? .073 : .125, radius = core ? .009 : .019;
  const geometry = new LatheGeometry([[0, 0], [radius * .65, .05], [radius, .24], [radius * .72, .5], [radius * .3, .78], [0, 1]].map(([r, y]) => new Vector2(r, y * height)), 10);
  const position = geometry.getAttribute('position'), colors = new Float32Array(position.count * 3);
  const base = new Color(core ? 0xfff4cc : 0xffd16f), tip = new Color(core ? 0xffd378 : 0xe96b18), color = new Color();
  for (let i = 0; i < position.count; i++) { color.copy(base).lerp(tip, position.getY(i) / height); color.toArray(colors, i * 3); }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}
function haloTexture() {
  const size = 32, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1), at = (y * size + x) * 4;
    data[at] = data[at + 1] = data[at + 2] = 255;
    data[at + 3] = Math.round(255 * Math.max(0, 1 - radius) ** 3);
  }
  const texture = new DataTexture(data, size, size); texture.needsUpdate = true; return texture;
}

export function buildCandles(cathedral: Object3D, options = { shadows: true, tier: 'high' }) {
  const tips = findCandleTips(cathedral), root = new Group(); root.name = 'Altar candle flames and practical light';
  const low = options.tier === 'minimal' || options.tier === 'economy';
  const outerGeometry = flameGeometry(false), coreGeometry = flameGeometry(true);
  const outerMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: .94, depthWrite: false });
  const coreMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, depthWrite: false });
  const outer = new InstancedMesh(outerGeometry, outerMaterial, tips.length), core = new InstancedMesh(coreGeometry, coreMaterial, tips.length);
  outer.name = 'Six amber flame envelopes'; core.name = 'Six luminous flame cores';
  root.add(outer, core);
  const texture = low ? null : haloTexture(), halos: Sprite[] = [];
  const haloMaterial = texture ? new SpriteMaterial({ map: texture, color: 0xffaf54, opacity: .22, blending: AdditiveBlending, depthTest: true, depthWrite: false, toneMapped: false }) : null;
  if (haloMaterial) for (const tip of tips) {
    const halo = new Sprite(haloMaterial); halo.name = 'Small candle halo'; halo.position.copy(tip).y += .05; halo.scale.set(.28, .28, 1); halos.push(halo); root.add(halo);
  }
  const lights: PointLight[] = [];
  const practicalIntensity = low ? 3.5 : 2.2;
  // Two aggregates represent the two groups of three candles. They use real opaque shadows,
  // not projected floor decals. Static geometry permits one cached cube map per group.
  if (options.shadows) for (const index of low ? [2] : [1, 4]) {
    const light = new PointLight(0xffbb77, practicalIntensity, 12, 2);
    light.name = `Altar candles ${index}`; light.position.copy(tips[index]).y += .07;
    light.castShadow = true; light.shadow.mapSize.set(low ? 256 : 512, low ? 256 : 512);
    light.shadow.camera.near = .04; light.shadow.camera.far = 12;
    light.shadow.bias = -.00008; light.shadow.normalBias = .008; light.shadow.radius = 1.2;
    light.shadow.autoUpdate = false; light.shadow.needsUpdate = true;
    lights.push(light); root.add(light);
  }
  const matrix = new Matrix4(), rotation = new Quaternion(), tilt = new Euler(), scale = new Vector3(), position = new Vector3();
  let disposed = false, lastStatic = false;
  const update = (time: number, reduced: boolean) => {
    if (disposed || (reduced && lastStatic)) return;
    lastStatic = reduced;
    for (let i = 0; i < tips.length; i++) {
      const pulse = candlePulse(time, i, reduced);
      position.copy(tips[i]).y += .001;
      tilt.set(reduced ? 0 : .035 * Math.sin(time * 1.8 + i), 0, reduced ? 0 : .025 * Math.sin(time * 2.1 + i * 2)); rotation.setFromEuler(tilt);
      scale.set(1, pulse, 1); matrix.compose(position, rotation, scale);
      outer.setMatrixAt(i, matrix); core.setMatrixAt(i, matrix);
    }
    outer.instanceMatrix.needsUpdate = core.instanceMatrix.needsUpdate = true;
    lights.forEach((light, i) => { light.intensity = practicalIntensity * candlePulse(time, i + 1, reduced); });
  };
  update(0, true); outer.computeBoundingSphere(); core.computeBoundingSphere();
  return { root, lights, tips, stats: { flames: tips.length, shadowMaps: lights.length, shadowFaces: lights.length * 6, flameDraws: 2 + halos.length }, update,
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear(); outer.dispose(); core.dispose();
      outerGeometry.dispose(); coreGeometry.dispose(); outerMaterial.dispose(); coreMaterial.dispose(); haloMaterial?.dispose(); texture?.dispose();
      for (const light of lights) light.shadow.dispose();
    },
  };
}
