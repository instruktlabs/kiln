import { afterAll, expect, test } from 'bun:test';
import { DataTexture, Texture } from 'three/webgpu';
import { getCurrentStack, setCurrentStack, stack } from 'three/tsl';
import { createAtmosphereUniforms } from '../../src/world/fog';
import { createWaterMaterial, createWaterUniforms, DETAIL_LAYERS, GERSTNER_WAVES, ORIGIN_SNAP, updateWaterUniforms, waveConstants } from '../../src/world/water-material';

// Inspect real TSL arithmetic, without compiling/rendering it or copying the shader expression.
// Three's shader graph has heterogeneous node fields which its public typings do not describe.
type GraphNode = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const uniforms = createWaterUniforms(), maps = new DataTexture(), slopes = new DataTexture(), macro = new DataTexture(), environment = new Texture();
const bounds: [number, number, number, number] = [-1000, -1000, 1000, 1000];
const material = createWaterMaterial({ atmosphere: createAtmosphereUniforms(), grid: 8,
  displacedWaves: GERSTNER_WAVES.length, fragmentWaves: GERSTNER_WAVES.length,
  // Isolate the foam's slope-map lookup from the optional normal-detail layers.
  detailLayers: 0, reflection: 'environment', environment, depthContact: false,
  near: { texture: maps, bounds }, mid: { texture: maps, bounds }, flow: { texture: maps, bounds }, slopeMoments: slopes, macroNoise: macro }, uniforms);
afterAll(() => { material.dispose(); for (const texture of [maps, slopes, macro, environment]) texture.dispose(); });

function graph(entry: GraphNode): GraphNode[] {
  while (entry.isVarNode) entry = entry.node;
  const previous = getCurrentStack(), scope = stack();
  let result: GraphNode;
  setCurrentStack(scope);
  try { result = entry.shaderNode.jsFunc(); } finally { setCurrentStack(previous); }
  const seen = new Set<GraphNode>();
  const visit = (node: GraphNode) => {
    if (!node?.isNode || seen.has(node)) return;
    seen.add(node); for (const child of node.getChildren()) visit(child);
  };
  visit(result); visit(scope);
  return [...seen];
}
const stages = { vertex: graph(material.positionNode), fragment: graph(material.colorNode) };

/** Evaluate the small arithmetic subgraph at a fixed, already-morphed world surface point.
 * The vertex's p-origin and fragment's vWaterRel represent that same surface parameter.
 * Texture sampling, perspective footprint filtering and shading are outside this CPU test. */
function evaluate(node: GraphNode, world: readonly [number, number]): number[] {
  const rel = () => [world[0] - uniforms.origin.value.x, world[1] - uniforms.origin.value.y];
  if (node.isVaryingNode && node.name === 'vWaterRel') return rel();
  if (node.isOperatorNode && node.op === '-' && node.bNode === uniforms.origin) return rel();
  if (node.isVarNode || node.isConvertNode) return evaluate(node.node, world);
  if (node.isConstNode || node.isUniformNode) return typeof node.value === 'number' ? [node.value] : node.value.toArray();
  if (node.isSplitNode) {
    const value = evaluate(node.node, world);
    return [...node.components].map(component => value['xyzw'.indexOf(component)]!);
  }
  if (node.isOperatorNode) {
    const a = evaluate(node.aNode, world), b = evaluate(node.bNode, world);
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => {
      const left = a[a.length === 1 ? 0 : i]!, right = b[b.length === 1 ? 0 : i]!;
      if (node.op === '+') return left + right;
      if (node.op === '-') return left - right;
      if (node.op === '*') return left * right;
      if (node.op === '/') return left / right;
      throw new Error(`Unsupported arithmetic ${node.op}`);
    });
  }
  throw new Error(`Unexpected coordinate graph node ${node.constructor.name}`);
}
function waveNodes(stage: keyof typeof stages): GraphNode[] {
  return uniforms.phases.map(phase => {
    const matches = stages[stage].filter(node => node.isOperatorNode && (node.aNode === phase || node.bNode === phase));
    expect(matches).toHaveLength(1);
    return matches[0]!;
  });
}
const world: readonly [number, number] = [73.25, -619.5];
const crossings = [
  [[ORIGIN_SNAP / 2 - .001, 0], [ORIGIN_SNAP / 2 + .001, 0]],
  [[-ORIGIN_SNAP / 2 - .001, 0], [-ORIGIN_SNAP / 2 + .001, 0]],
  [[0, ORIGIN_SNAP / 2 - .001], [0, ORIGIN_SNAP / 2 + .001]],
  [[0, -ORIGIN_SNAP / 2 - .001], [0, -ORIGIN_SNAP / 2 + .001]],
] as const;

for (const stage of ['vertex', 'fragment'] as const) {
  test(`${stage} wave phases at a fixed world point survive every camera-origin snap`, () => {
    const nodes = waveNodes(stage);
    for (const [before, after] of crossings) {
      updateWaterUniforms(uniforms, 17.25, ...before);
      const first = nodes.map(node => evaluate(node, world)[0]!);
      updateWaterUniforms(uniforms, 17.25, ...after);
      nodes.forEach((node, i) => {
        const second = evaluate(node, world)[0]!;
        expect(Math.sin(second)).toBeCloseTo(Math.sin(first[i]!), 9);
        expect(Math.cos(second)).toBeCloseTo(Math.cos(first[i]!), 9);
      });
    }
  });

  test(`${stage} waves propagate along their declared direction`, () => {
    const nodes = waveNodes(stage), time = 5.75, dt = .13;
    updateWaterUniforms(uniforms, time, 0, 0);
    const first = nodes.map(node => evaluate(node, world)[0]!);
    updateWaterUniforms(uniforms, time + dt, 0, 0);
    nodes.forEach((node, i) => {
      const { omega } = waveConstants(GERSTNER_WAVES[i]!);
      const change = evaluate(node, world)[0]! - first[i]!;
      // Constant phase moves in +direction only for k dot p - omega*t.
      expect(Math.sin(change)).toBeCloseTo(Math.sin(-omega * dt), 9);
      expect(Math.cos(change)).toBeCloseTo(Math.cos(-omega * dt), 9);
    });
  });

  test(`${stage} phase wrapping stays world-anchored across distant origin cells`, () => {
    const nodes = waveNodes(stage), tau = 2 * Math.PI;
    // Includes negative cells and a numerical stress case at the clipmap's ~130 km extent.
    // This checks CPU compensation arithmetic, not GPU float precision or camera reachability.
    for (const [ox, oz] of [[0, 0], [-16 * ORIGIN_SNAP, 16 * ORIGIN_SNAP], [512 * ORIGIN_SNAP, -512 * ORIGIN_SNAP]]) {
      const point: readonly [number, number] = [ox! + 37.25, oz! - 19.5];
      nodes.forEach((node, i) => {
        const { k, dx, dz, omega } = waveConstants(GERSTNER_WAVES[i]!);
        const originPhase = k * (dx * ox! + dz * oz!);
        // Straddle an actual CPU phase wrap after four hours of scene time while
        // also crossing an origin boundary. Continuity must not rely on either wrap aligning.
        const turns = Math.floor((originPhase - omega * 14400) / tau);
        const wrapTime = (originPhase - turns * tau) / omega;
        for (const delta of [-.0001, .0001]) {
          const time = wrapTime + delta;
          updateWaterUniforms(uniforms, time, ox! + ORIGIN_SNAP / 2 + delta, oz!);
          const actual = evaluate(node, point)[0]!, expected = k * (dx * point[0] + dz * point[1]) - omega * time;
          expect(Math.sin(actual)).toBeCloseTo(Math.sin(expected), 8);
          expect(Math.cos(actual)).toBeCloseTo(Math.cos(expected), 8);
          expect(uniforms.phases[i]!.value).toBeGreaterThanOrEqual(0);
          expect(uniforms.phases[i]!.value).toBeLessThan(tau);
        }
      });
    }
  });
}

test('foam-breakup texture coordinates at a fixed world point survive camera-origin snaps', () => {
  const lookups = stages.fragment.filter(node => node.isTextureNode && node.value === slopes);
  expect(lookups).toHaveLength(1);
  const uv = lookups[0]!.uvNode;
  for (const [before, after] of crossings) {
    updateWaterUniforms(uniforms, 17.25, ...before); const first = evaluate(uv, world);
    updateWaterUniforms(uniforms, 17.25, ...after); const second = evaluate(uv, world);
    // RepeatWrapping permits integer shifts, never a different texel phase.
    for (let axis = 0; axis < 2; axis++) {
      const delta = second[axis]! - first[axis]!;
      expect(delta - Math.round(delta)).toBeCloseTo(0, 9);
    }
  }
});

test('foam-breakup keeps its unrotated tile and time drift through offset wraps and distant origins', () => {
  const uv = stages.fragment.find(node => node.isTextureNode && node.value === slopes)!.uvNode;
  const layer = DETAIL_LAYERS[0]!, angle = layer.rotation * Math.PI / 180;
  for (const [ox, oz] of [[0, 0], [-4096, 4096], [131072, -131072]]) {
    const point: readonly [number, number] = [ox! + world[0], oz! + world[1]];
    const rate = layer.drift * Math.cos(angle) / layer.tile;
    const wrapTime = (Math.ceil(ox! / 7.3 + rate * 14400) - ox! / 7.3) / rate;
    for (const time of [0, 12, wrapTime - .0001, wrapTime + .0001]) {
      updateWaterUniforms(uniforms, time, ox!, oz!);
      const actual = evaluate(uv, point);
      const expected = [point[0] / 7.3 + layer.drift * time * Math.cos(angle) / layer.tile,
        point[1] / 7.3 + layer.drift * time * Math.sin(angle) / layer.tile];
      for (let axis = 0; axis < 2; axis++) {
        const delta = actual[axis]! - expected[axis]!;
        expect(delta - Math.round(delta)).toBeCloseTo(0, 9);
      }
    }
  }
});
