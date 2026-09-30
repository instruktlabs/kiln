import { expect, test } from 'bun:test';
import { createKilnProgramToolRegistry } from '../registry';
import { COMPACT_PART_PREVIEW } from '../review-detail';

const code = `const meta={name:'Part inventory'};function build(){
const root=createRoot('Root'), m=gameMaterial('#888888');
for(let i=0;i<45;i++)createPart('Panel'+i,boxGeo(.1,.1,.1),m,{parent:root,position:[i*.2,0,0]});
const joint=createPivot('Nested',[0,1,0],root);
for(let i=0;i<2;i++){const lug=createPart('Lug',boxGeo(.1,.1,.1),m,{parent:joint,position:[i,0,0]});lug.name='Lug / [left]';}
return root;}`;

interface Listing {
  total: number;
  matched: number;
  offset: number;
  nextOffset?: number;
  parts: { name: string; path: string }[];
}
interface Output {
  ok: boolean;
  programRef: string;
  partListing?: Listing;
  parts: Listing['parts'];
  partsTotal: number;
  partsTruncated: boolean;
  partsNextOffset?: number;
  partsHint?: string;
  measurement?: { distance: number };
  pngBase64?: string;
  viewFidelity?: unknown;
  error?: string;
}

test('all render paths identify their bounded part preview and the next inspection page', async () => {
  const render = createKilnProgramToolRegistry().find((t) => t.name === 'kiln_render')!;
  for (const [detail, preview] of [
    [undefined, COMPACT_PART_PREVIEW],
    ['full', 80],
  ] as const) {
    for (const controls of [
      { capture: { preset: '1x1' } },
      { capture: { version: 'kiln.capture.v1', shots: [{}], size: 128 } },
    ]) {
      const output = (await render.run({ code, ...controls, detail })) as Output;
      expect(output.ok).toBe(true);
      expect(output.parts).toHaveLength(preview);
      expect(output.partsTotal).toBeGreaterThan(80);
      expect(output.partsTruncated).toBe(true);
      expect(output.partsNextOffset).toBe(preview);
      expect(output.partsHint).toContain(`listParts:{offset:${preview}}`);
      expect(output.parts.some((p) => p.name === 'Lug / [left]')).toBe(false);
    }
  }
});

test('part listing finds late nested duplicate names and supplies exact usable paths without images', async () => {
  let renders = 0;
  const defs = createKilnProgramToolRegistry({
    captureLimits: { maxTotalPixels: 1, maxOutputBytes: 1 },
    viewRenderPort: async () => {
      renders++;
      throw new Error('Listing must not render');
    },
  });
  const inspect = defs.find((t) => t.name === 'kiln_inspect')!;
  const first = (await inspect.run({
    code,
    image: false,
    listParts: {},
  })) as Output;
  expect(first.ok).toBe(true);
  const listing = first.partListing!;
  expect(listing.parts).toHaveLength(80);
  expect(listing.nextOffset).toBe(80);
  expect(listing.matched).toBe(listing.total);
  const rest = (await inspect.run({
    programRef: first.programRef,
    image: false,
    listParts: { offset: listing.nextOffset },
  })) as Output;
  expect(rest.partListing?.nextOffset).toBeUndefined();
  const all = [...listing.parts, ...rest.partListing!.parts];
  expect(all.length).toBe(listing.total);
  expect(new Set(all.map((p) => p.path)).size).toBe(all.length);
  const filtered = (await inspect.run({
    programRef: first.programRef,
    image: false,
    listParts: { query: ' LUG / [LEFT] ', limit: 2 },
  })) as Output;
  expect(filtered.partListing).toMatchObject({
    total: listing.total,
    matched: 4,
    offset: 0,
    nextOffset: 2,
  });
  const next = (await inspect.run({
    programRef: first.programRef,
    image: false,
    listParts: { query: 'lug / [left]', offset: 2, limit: 2 },
  })) as Output;
  const a = filtered.partListing!.parts[0]!.path,
    b = next.partListing!.parts[0]!.path;
  expect(a).toContain('Joint_Nested[0]/Lug%20%2F%20%5Bleft%5D[0]');
  expect(b).toContain('Joint_Nested[0]/Lug%20%2F%20%5Bleft%5D[1]');
  const measured = (await inspect.run({
    programRef: first.programRef,
    image: false,
    listParts: { query: b },
    measure: { from: { subject: { path: a } }, to: { subject: { path: b } } },
  })) as Output;
  expect(measured.ok).toBe(true);
  expect(measured.measurement?.distance).toBeCloseTo(1, 6);
  expect(measured.partListing!.parts.every((p) => p.path.startsWith(b))).toBe(true);
  for (const output of [first, rest, filtered, next, measured]) {
    expect(output.pngBase64).toBeUndefined();
    expect(output.viewFidelity).toBeUndefined();
    expect(inspect.media!(output)).toBeUndefined();
  }
  expect(renders).toBe(0);
  for (const listParts of [{ query: 'not present' }, { offset: 10000 }]) {
    const empty = (await inspect.run({
      programRef: first.programRef,
      image: false,
      listParts,
    })) as Output;
    expect(empty.ok).toBe(true);
    expect(empty.partListing!.parts).toEqual([]);
    expect(empty.partListing!.nextOffset).toBeUndefined();
  }
});

test('listing controls are bounded and camera conflicts stay explicit', async () => {
  const inspect = createKilnProgramToolRegistry().find((t) => t.name === 'kiln_inspect')!;
  for (const listParts of [
    { offset: -1 },
    { offset: 0.5 },
    { limit: 0 },
    { limit: 101 },
    { query: 'x'.repeat(4097) },
    { unknown: true },
  ]) {
    await expect(inspect.run({ code, image: false, listParts })).rejects.toThrow();
  }
  const bad = (await inspect.run({
    code,
    image: false,
    listParts: {},
    part: 'Lug',
  })) as Output;
  expect(bad.ok).toBe(false);
  expect(bad.error).toContain('camera controls');
  const small = (await createKilnProgramToolRegistry()
    .find((t) => t.name === 'kiln_render')!
    .run({
      code: "const meta={name:'small'};function build(){return createPart('Body',boxGeo(1,1,1),gameMaterial('#888888'));}",
    })) as Output;
  expect(small.ok).toBe(true);
  expect(small.partsTotal).toBe(small.parts.length);
  expect(small.partsTruncated).toBe(false);
  expect(small.partsNextOffset).toBeUndefined();
});

const transformed = `const meta={name:'Transforms'};function build(){
const root=createRoot('Root'), m=gameMaterial('#888888');
const arm=createPivot('Arm',[1,0,0],root);
arm.rotation.y=Math.PI/2; arm.scale.set(2,2,2);
createPart('Block',boxGeo(1,0.5,0.25),m,{parent:arm,position:[0,1,0]});
createPart('Mirror',boxGeo(1,1,1),m,{parent:root,position:[-3,0,0],scale:[-1,1,1]});
createPivot('Socket',[0,5,0],root);
return root;}`;

interface TransformedPart {
  path: string;
  name: string;
  position: number[];
  quaternion: number[];
  scale: number[];
  mirrored: boolean;
  bounds: { min: number[]; max: number[] } | null;
}

const close = (actual: number[] | undefined, expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  for (const [i, value] of expected.entries()) expect(actual![i]).toBeCloseTo(value, 5);
};

test('listed parts carry world transforms, mirrored flags and world bounds in every detail level', async () => {
  const inspect = createKilnProgramToolRegistry().find((t) => t.name === 'kiln_inspect')!;
  for (const detail of [undefined, 'full'] as const) {
    const output = (await inspect.run({
      code: transformed,
      image: false,
      listParts: {},
      detail,
    })) as { ok: boolean; partListing: { parts: TransformedPart[] } };
    expect(output.ok).toBe(true);
    const parts = output.partListing.parts;
    for (const part of parts)
      expect(Object.keys(part).sort()).toEqual(
        ['bounds', 'mirrored', 'name', 'path', 'position', 'quaternion', 'scale'].sort(),
      );
    const byName = (name: string) => parts.find((part) => part.name === name)!;
    const arm = byName('Joint_Arm');
    close(arm.position, [1, 0, 0]);
    close(arm.quaternion, [0, Math.SQRT1_2, 0, Math.SQRT1_2]);
    close(arm.scale, [2, 2, 2]);
    expect(arm.mirrored).toBe(false);
    const block = byName('Mesh_Block');
    close(block.position, [1, 2, 0]);
    close(block.scale, [2, 2, 2]);
    close(block.bounds!.min, [0.75, 1.5, -1]);
    close(block.bounds!.max, [1.25, 2.5, 1]);
    close(arm.bounds!.min, block.bounds!.min);
    const mirror = byName('Mesh_Mirror');
    expect(mirror.mirrored).toBe(true);
    close(mirror.position, [-3, 0, 0]);
    close(mirror.scale, [-1, 1, 1]);
    close(mirror.quaternion, [0, 0, 0, 1]);
    close(mirror.bounds!.min, [-3.5, -0.5, -0.5]);
    close(mirror.bounds!.max, [-2.5, 0.5, 0.5]);
    expect(byName('Mesh_Mirror:primitive-0').mirrored).toBe(true);
    const socket = byName('Joint_Socket');
    close(socket.position, [0, 5, 0]);
    expect(socket.bounds).toBeNull();
    const root = byName('Root');
    close(root.bounds!.min, [-3.5, -0.5, -1]);
    close(root.bounds!.max, [1.25, 2.5, 1]);
  }
  const render = createKilnProgramToolRegistry().find((t) => t.name === 'kiln_render')!;
  const preview = (await render.run({ code: transformed })) as Output;
  expect(preview.parts.every((part) => Object.keys(part).sort().join() === 'name,path')).toBe(true);
});
