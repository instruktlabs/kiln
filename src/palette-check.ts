/**
 * Advisory palette check (delivery contract item 7).
 *
 * `definePalette(['#6b6f73', '#3a3d40', ...])` declares the asset's colour palette. Every
 * receipt then lists each drawn material whose base colour is farther than `threshold`
 * (CIE 1976 delta E in CIELAB, default 10) from the nearest palette entry. The check is
 * advisory: it adds warnings and a manifest `palette` report and never fails a build.
 */
import type { Document } from '@gltf-transform/core';
import type * as THREE from 'three';
import type { PaletteReportV1 } from './contracts/integration';
import { COLLIDER_PROXY_MATERIAL_NAME } from './delivery';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';
import { isHiddenGltfNode } from './metrics';

/** Where a declaration lives: root userData until export, then default-scene extras. */
export const KILN_PALETTE_KEY = 'kilnPaletteV1';
export const PALETTE_DEFAULT_THRESHOLD = 10;
export const PALETTE_MAX_COLORS = 64;

export interface PaletteOptionsV1 {
  /** CIE76 delta E above which a material is reported (default 10). */
  threshold?: number;
}
export interface PaletteDeclarationV1 {
  schemaVersion: 1;
  /** Lowercase `#rrggbb` sRGB entries in the declared order. */
  colors: string[];
  threshold: number;
}

const fail = (detail: string): never => {
  throw new AuthoringDiagnosticError(
    'DELIVERY_CONTRACT',
    `definePalette(colors, opts?): ${detail}`,
  );
};

function hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))
    fail(`${label} must be a hex colour such as '#6b6f73', got ${JSON.stringify(value)}.`);
  const digits = (value as string).replace('#', '').toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits}`;
}

export function normalizePalette(colors: unknown, opts?: unknown): PaletteDeclarationV1 {
  if (!Array.isArray(colors) || colors.length === 0 || colors.length > PALETTE_MAX_COLORS)
    fail(`colors must be an array of 1..${PALETTE_MAX_COLORS} hex colours.`);
  const entries = (colors as unknown[]).map((value, i) => hex(value, `colors[${i}]`));
  let threshold = PALETTE_DEFAULT_THRESHOLD;
  if (opts !== undefined) {
    if (!opts || typeof opts !== 'object' || Array.isArray(opts))
      fail('opts must be { threshold? }.');
    for (const key of Object.keys(opts as object))
      if (key !== 'threshold') fail(`unknown option ${JSON.stringify(key)}.`);
    const t = (opts as { threshold?: unknown }).threshold;
    if (t !== undefined) {
      if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0 || t > 100)
        fail(`threshold must be a delta E in (0, 100], got ${String(t)}.`);
      threshold = t as number;
    }
  }
  return { schemaVersion: 1, colors: [...new Set(entries)], threshold };
}

/** Declare the palette; with `target` (normally the root) it is stamped there. */
export function definePalette(
  colors: readonly string[],
  opts?: PaletteOptionsV1,
  target?: THREE.Object3D,
): PaletteDeclarationV1 {
  const declaration = normalizePalette(colors, opts);
  if (target !== undefined) {
    if ((target as { isObject3D?: boolean } | null)?.isObject3D !== true)
      fail('target must be a scene node, normally the root.');
    target.userData[KILN_PALETTE_KEY] = structuredClone(declaration);
  }
  return declaration;
}

export function readPaletteDeclaration(value: unknown): PaletteDeclarationV1 | undefined {
  if (value === undefined) return undefined;
  try {
    const record = value as { schemaVersion?: unknown; colors?: unknown; threshold?: unknown };
    if (record.schemaVersion !== 1) return undefined;
    return normalizePalette(record.colors, { threshold: record.threshold });
  } catch {
    return undefined;
  }
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055;

/** Linear RGB (0..1) to CIELAB under D65. */
export function linearRgbToLab([r, g, b]: readonly [number, number, number]): [
  number,
  number,
  number,
] {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const hexToLinear = (value: string): [number, number, number] => {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => srgbToLinear(c / 255)) as [
    number,
    number,
    number,
  ];
};
const linearToHex = (rgb: readonly number[]) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, linearToSrgb(c))) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
const deltaE = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * Compare every material drawn by a visible scene node (collider proxies excluded) with the
 * palette. glTF base colour factors are linear; they are compared in CIELAB after conversion.
 * A textured material is judged by its factor (which tints the texture) and says so.
 */
export function evaluatePalette(declaration: PaletteDeclarationV1, doc: Document): PaletteReportV1 {
  const palette = declaration.colors.map((color) => ({
    color,
    lab: linearRgbToLab(hexToLinear(color)),
  }));
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const materials = new Set<import('@gltf-transform/core').Material>();
  const visit = (node: import('@gltf-transform/core').Node, hidden: boolean): void => {
    const nodeHidden = hidden || isHiddenGltfNode(node);
    if (!nodeHidden)
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const material = primitive.getMaterial();
        if (material && material.getName() !== COLLIDER_PROXY_MATERIAL_NAME)
          materials.add(material);
      }
    for (const child of node.listChildren()) visit(child, nodeHidden);
  };
  for (const node of scene?.listChildren() ?? []) visit(node, false);
  const offPalette: PaletteReportV1['offPalette'] = [];
  for (const material of materials) {
    const factor = material.getBaseColorFactor();
    const lab = linearRgbToLab([factor[0]!, factor[1]!, factor[2]!]);
    let nearest = palette[0]!;
    let distance = Number.POSITIVE_INFINITY;
    for (const entry of palette) {
      const d = deltaE(lab, entry.lab);
      if (d < distance) {
        distance = d;
        nearest = entry;
      }
    }
    if (distance > declaration.threshold)
      offPalette.push({
        material: material.getName(),
        color: linearToHex(factor.slice(0, 3)),
        nearest: nearest.color,
        deltaE: Math.round(distance * 100) / 100,
        ...(material.getBaseColorTexture() ? { textured: true as const } : {}),
      });
  }
  offPalette.sort((a, b) => b.deltaE - a.deltaE || (a.material < b.material ? -1 : 1));
  return {
    status: offPalette.length ? 'warn' : 'pass',
    colors: [...declaration.colors],
    threshold: declaration.threshold,
    checkedMaterials: materials.size,
    offPalette,
  };
}
