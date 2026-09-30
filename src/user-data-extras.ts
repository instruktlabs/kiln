/**
 * Author `userData` as glTF `extras` (R48).
 *
 * A node's or a material's `userData` exports as that node's or material's `extras` when it is
 * plain JSON: null, booleans, finite numbers, strings, arrays and plain objects. Keys that
 * start with `kiln` belong to the engine, which exports its own validated payloads (semantic
 * metadata, rig joints) through their own paths and never an author's. A key whose value is
 * `undefined` is absent, as `JSON.stringify` treats it.
 *
 * Both limits are on the UTF-8 bytes of the JSON text: at most 4 KiB per node or material, and
 * at most 64 KiB for the asset, counted in scene order (each node, then the materials it is
 * the first to use). What is left out is named in one build warning per reason; nothing is
 * dropped silently. `kiln_validate` reports the literal cases before a build.
 */

/** Largest `userData` JSON one node or material exports, in UTF-8 bytes. */
export const MAX_USER_DATA_BYTES_PER_OBJECT = 4096;
/** Largest `userData` JSON one asset exports, in UTF-8 bytes. */
export const MAX_USER_DATA_BYTES_TOTAL = 65536;
/** Author keys may not start with this; the engine owns them. */
export const RESERVED_USER_DATA_PREFIX = 'kiln';

export const isReservedUserDataKey = (key: string): boolean =>
  key.startsWith(RESERVED_USER_DATA_PREFIX);

const MAX_LISTED = 8;
const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

interface WithUserData {
  name?: string;
  userData?: Record<string, unknown>;
}
interface SceneObject extends WithUserData {
  isMaterial?: boolean;
  material?: unknown;
  children?: SceneObject[];
}

/**
 * Why a value is not plain JSON, or undefined when it is. Plain objects from any realm pass:
 * the sandbox builds in its own realm, so identity with this realm's `Object.prototype` is
 * not the test.
 */
export function nonJsonReason(value: unknown, seen: Set<object> = new Set()): string | undefined {
  if (value === null) return undefined;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return undefined;
    case 'number':
      return Number.isFinite(value) ? undefined : `a non-finite number (${value})`;
    case 'undefined':
      return 'undefined';
    case 'function':
      return 'a function';
    case 'symbol':
      return 'a symbol';
    case 'bigint':
      return 'a bigint';
  }
  const object = value as object;
  if (seen.has(object)) return 'a circular reference';
  const array = Array.isArray(object);
  const proto = Object.getPrototypeOf(object) as object | null;
  if (!array && proto !== null && Object.getPrototypeOf(proto) !== null) {
    const name = (proto as { constructor?: { name?: string } }).constructor?.name;
    return name ? `a ${name}` : 'a class instance';
  }
  seen.add(object);
  try {
    if (array) {
      for (let i = 0; i < (object as unknown[]).length; i++) {
        const reason = nonJsonReason((object as unknown[])[i], seen);
        if (reason) return `${reason} at [${i}]`;
      }
      return undefined;
    }
    for (const [key, item] of Object.entries(object)) {
      if (item === undefined) continue;
      const reason = nonJsonReason(item, seen);
      if (reason) return `${reason} at .${key}`;
    }
    return undefined;
  } finally {
    seen.delete(object);
  }
}

export interface AuthorExtras {
  /** Author extras for a node, or undefined when it exports none. */
  node(object: unknown): Record<string, unknown> | undefined;
  /** Author extras for a material, or undefined when it exports none. */
  material(material: unknown): Record<string, unknown> | undefined;
  /** One warning per reason something was left out. */
  warnings: string[];
}

const listed = (items: string[]): string =>
  items.length > MAX_LISTED
    ? `${items.slice(0, MAX_LISTED).join(', ')}, and ${items.length - MAX_LISTED} more`
    : items.join(', ');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Walk the scene once and decide what each node and material exports. Both exporters read
 * the result, so the legacy bridge and three's GLTFExporter write the same extras.
 */
export function collectAuthorExtras(root: unknown): AuthorExtras {
  const nodes = new Map<unknown, Record<string, unknown>>();
  const materials = new Map<unknown, Record<string, unknown> | undefined>();
  const notSerializable: string[] = [];
  const tooLarge: string[] = [];
  const overTotal: string[] = [];
  let total = 0;

  const exportable = (owner: WithUserData, label: string) => {
    const userData = owner.userData;
    if (!userData || typeof userData !== 'object') return undefined;
    const kept: Record<string, unknown> = {};
    let any = false;
    for (const key of Object.keys(userData)) {
      if (isReservedUserDataKey(key)) continue;
      const value = userData[key];
      if (value === undefined) continue;
      const reason = nonJsonReason(value);
      if (reason) {
        notSerializable.push(`${label} userData.${key} (${reason})`);
        continue;
      }
      kept[key] = value;
      any = true;
    }
    if (!any) return undefined;
    const json = JSON.stringify(kept);
    const bytes = utf8Bytes(json);
    if (bytes > MAX_USER_DATA_BYTES_PER_OBJECT) {
      tooLarge.push(`${label} userData (${bytes} bytes)`);
      return undefined;
    }
    if (total + bytes > MAX_USER_DATA_BYTES_TOTAL) {
      overTotal.push(label);
      return undefined;
    }
    total += bytes;
    // A detached host-realm copy: the exporters never hold the author's objects.
    return JSON.parse(json) as Record<string, unknown>;
  };

  const visit = (object: SceneObject) => {
    const name = object.name || '(unnamed node)';
    const extras = exportable(object, name);
    if (extras) nodes.set(object, extras);
    const slots = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of slots as WithUserData[]) {
      if (!material || !(material as SceneObject).isMaterial || materials.has(material)) continue;
      const label = `material ${material.name ? `${material.name} ` : ''}on ${name}`;
      materials.set(material, exportable(material, label));
    }
    for (const child of object.children ?? []) visit(child);
  };
  visit(root as SceneObject);

  const warnings: string[] = [];
  if (notSerializable.length)
    warnings.push(
      `USER_DATA_NOT_SERIALIZABLE (${plural(notSerializable.length, 'key', 'keys')}: ${listed(notSerializable)}): not exported as glTF extras; userData exports only plain JSON (null, booleans, finite numbers, strings, arrays and plain objects).`,
    );
  if (tooLarge.length)
    warnings.push(
      `USER_DATA_TOO_LARGE (${plural(tooLarge.length, 'object', 'objects')}: ${listed(tooLarge)}): not exported; a node or material exports at most ${MAX_USER_DATA_BYTES_PER_OBJECT} bytes of userData JSON.`,
    );
  if (overTotal.length)
    warnings.push(
      `USER_DATA_TOTAL_LIMIT (${plural(overTotal.length, 'object', 'objects')} over ${MAX_USER_DATA_BYTES_TOTAL} bytes: ${listed(overTotal)}): not exported; an asset exports at most ${MAX_USER_DATA_BYTES_TOTAL} bytes of userData JSON, counted in scene order.`,
    );
  return {
    node: (object) => nodes.get(object),
    material: (material) => materials.get(material),
    warnings,
  };
}
