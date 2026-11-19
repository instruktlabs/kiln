#!/usr/bin/env node
// Explain a byte mismatch between two GLBs from the spike: JSON differences by path, then
// binary differences by accessor, with the largest numeric delta. Not part of the package.
//
//   node scripts/browser-runtime-spike/glb-diff.mjs node.glb browser.glb
import { readFile } from 'node:fs/promises';

function parse(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let json;
  let bin = new Uint8Array();
  while (offset < bytes.length) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else bin = body;
    offset += 8 + length;
  }
  return { json, bin };
}

function jsonDiff(a, b, path = '$', out = []) {
  if (out.length > 40) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || a === null || b === null) {
    if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    return out;
  }
  if (typeof a !== 'object') {
    if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    return out;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
    jsonDiff(a[key], b[key], `${path}.${key}`, out);
  return out;
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const READERS = {
  5126: [4, 'getFloat32'],
  5125: [4, 'getUint32'],
  5123: [2, 'getUint16'],
  5122: [2, 'getInt16'],
  5121: [1, 'getUint8'],
  5120: [1, 'getInt8'],
};

/** Every accessor element, strided or not, read through a DataView. */
function readAccessor(bin, json, accessor) {
  const view = json.bufferViews?.[accessor.bufferView];
  const [size, method] = READERS[accessor.componentType] ?? [];
  if (!view || !size) return undefined;
  const components = COMPONENTS[accessor.type];
  const stride = view.byteStride ?? size * components;
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = new Float64Array(accessor.count * components);
  for (let i = 0; i < accessor.count; i++)
    for (let c = 0; c < components; c++)
      values[i * components + c] = data[method](base + i * stride + c * size, true);
  return values;
}

function accessorDiff(left, right) {
  const out = [];
  const json = left.json;
  for (const [index, accessor] of (json.accessors ?? []).entries()) {
    const a = readAccessor(left.bin, json, accessor);
    const b = readAccessor(right.bin, right.json, right.json.accessors[index]);
    if (!a || !b) continue;
    let differing = 0;
    let maxDelta = 0;
    let first;
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i] && !(Number.isNaN(a[i]) && Number.isNaN(b[i]))) {
        differing++;
        maxDelta = Math.max(maxDelta, Math.abs(a[i] - b[i]));
        first ??= { i, a: a[i], b: b[i] };
      }
    if (differing)
      out.push({
        accessor: index,
        type: `${accessor.type}/${accessor.componentType}`,
        normalized: accessor.normalized,
        count: a.length,
        differing,
        maxDelta,
        first,
        usedBy: (json.meshes ?? []).flatMap((mesh, m) =>
          mesh.primitives.flatMap((primitive) =>
            Object.entries({ ...primitive.attributes, indices: primitive.indices })
              .filter(([, value]) => value === index)
              .map(([name]) => `${mesh.name ?? `mesh ${m}`}.${name}`),
          ),
        ),
      });
  }
  return out;
}

/** Embedded images: are the encoded bytes equal, and if not, are the decoded pixels? */
async function imageDiff(left, right) {
  const { default: sharp } = await import('sharp');
  const bytes = ({ json, bin }, image) => {
    const view = json.bufferViews[image.bufferView];
    return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  };
  const out = [];
  for (const [index, image] of (left.json.images ?? []).entries()) {
    const other = right.json.images?.[index];
    if (image.bufferView === undefined || other?.bufferView === undefined) continue;
    const a = bytes(left, image);
    const b = bytes(right, other);
    const sameBytes = a.length === b.length && a.every((value, i) => value === b[i]);
    let samePixels = sameBytes;
    if (!sameBytes) {
      const decode = async (png) => new Uint8Array(await sharp(png).ensureAlpha().raw().toBuffer());
      const [pa, pb] = await Promise.all([decode(a), decode(b)]);
      samePixels = pa.length === pb.length && pa.every((value, i) => value === pb[i]);
    }
    out.push({
      image: index,
      name: image.name,
      sameBytes,
      samePixels,
      bytes: [a.length, b.length],
    });
  }
  return out;
}

/** JSON paths that differ only because image bufferViews changed length. */
const layoutOnly = (path) =>
  /^\$\.bufferViews\.\d+\.(byteLength|byteOffset)$|^\$\.buffers\.0\.byteLength$/.test(path);

export async function diffGlb(leftPath, rightPath) {
  const left = parse(new Uint8Array(await readFile(leftPath)));
  const right = parse(new Uint8Array(await readFile(rightPath)));
  const json = jsonDiff(left.json, right.json);
  return {
    json,
    jsonOtherThanLayout: json.filter((path) => !layoutOnly(path.split(':')[0])),
    binLengths: [left.bin.length, right.bin.length],
    images: await imageDiff(left, right),
    accessors: accessorDiff(left, right),
  };
}

if (import.meta.main ?? process.argv[1]?.endsWith('glb-diff.mjs')) {
  const report = await diffGlb(process.argv[2], process.argv[3]);
  console.log(JSON.stringify(report, null, 2));
}
