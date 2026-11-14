/**
 * What one kit file says about itself, read from its glTF JSON alone. A kit carries its options as
 * tagged nodes (`extras.kilnParamV1` with `visibleWhen`), its colours as tagged materials, and its
 * sizes as morph targets named `<parameter>=<value>`. Nothing here touches three.js, so the same
 * rules can be checked in a test and used to fill instance buffers.
 */
export type ParamValue = string | number | boolean;
export type ParamValues = Readonly<Record<string, ParamValue | undefined>>;

/** The part of a kit's parameter declaration the page needs: defaults, and the range of each size. */
export interface KitDeclaration {
  defaults: Record<string, ParamValue>;
  sizes: Record<string, { min: number; default: number; max: number }>;
}

export interface KitTarget { param: string; value: number; index: number }
export interface KitCondition { param: string; visibleWhen: readonly ParamValue[] }

export interface KitMeshSpec {
  /** glTF node index of the drawn part. */
  node: number;
  name: string;
  mesh: number;
  material: number;
  /** Every option tag on the part and its ancestors. The part shows when all of them hold. */
  conditions: readonly KitCondition[];
  /** The colour parameter that drives this part's material, if any. */
  colour: string | null;
  /** One entry per morph target, in the mesh's target order. */
  targets: readonly KitTarget[];
}

export interface KitSpec { meshes: readonly KitMeshSpec[] }

interface Tag { name?: unknown; type?: unknown; visibleWhen?: unknown }
interface GltfNode { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[]; extras?: { kilnParamV1?: Tag } }
interface GltfMesh { primitives?: { material?: number; targets?: unknown[] }[]; extras?: { targetNames?: unknown } }
interface GltfMaterial { extras?: { kilnParamV1?: Tag } }
export interface KitGltf {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  materials?: GltfMaterial[];
}

const fail = (kit: string, message: string): never => { throw new Error(`Kit ${kit}: ${message}`); };

function conditionOf(kit: string, node: GltfNode): KitCondition | null {
  const tag = node.extras?.kilnParamV1;
  if (!tag) return null;
  if (typeof tag.name !== 'string' || !Array.isArray(tag.visibleWhen)) return fail(kit, `node ${node.name ?? '?'} has a malformed option tag`);
  return { param: tag.name, visibleWhen: tag.visibleWhen as ParamValue[] };
}

/**
 * Read a kit's drawn parts. The kits keep every drawn part at the kit's origin: a part with a
 * transform of its own, or below a node with one, would need its matrix per instance, so it is
 * refused here instead of being drawn in the wrong place.
 */
export function kitSpec(kit: string, json: KitGltf): KitSpec {
  const nodes = json.nodes ?? [], meshes = json.meshes ?? [], materials = json.materials ?? [];
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  const out: KitMeshSpec[] = [];
  const visit = (index: number, inherited: readonly KitCondition[]): void => {
    const node = nodes[index] ?? fail(kit, `node ${index} is missing`);
    const own = conditionOf(kit, node);
    const conditions = own ? [...inherited, own] : inherited;
    const moved = !!(node.translation || node.rotation || node.scale || node.matrix);
    const drawn = node.mesh !== undefined;
    if (moved && (drawn || node.children?.length)) fail(kit, `part ${node.name ?? index} is not at the kit origin`);
    if (drawn) {
      const mesh = meshes[node.mesh!] ?? fail(kit, `mesh ${node.mesh} is missing`);
      const primitives = mesh.primitives ?? [];
      if (primitives.length !== 1) fail(kit, `part ${node.name ?? index} has ${primitives.length} primitives`);
      const primitive = primitives[0]!;
      const material = primitive.material ?? fail(kit, `part ${node.name ?? index} has no material`);
      const names = primitive.targets?.length ? mesh.extras?.targetNames : [];
      if (!Array.isArray(names) || names.length !== (primitive.targets?.length ?? 0)) fail(kit, `part ${node.name ?? index} has unnamed morph targets`);
      const targets = (names as unknown[]).map((raw, i): KitTarget => {
        const text = String(raw), at = text.lastIndexOf('='), value = Number(text.slice(at + 1));
        if (at <= 0 || !Number.isFinite(value)) fail(kit, `morph target "${text}" is not <parameter>=<value>`);
        return { param: text.slice(0, at), value, index: i };
      });
      const tag = materials[material]?.extras?.kilnParamV1;
      out.push({
        node: index, name: node.name ?? `node-${index}`, mesh: node.mesh!, material, conditions,
        colour: tag?.type === 'color' && typeof tag.name === 'string' ? tag.name : null, targets,
      });
    }
    for (const child of node.children ?? []) visit(child, conditions);
  };
  for (const root of roots) visit(root, []);
  if (!out.length) fail(kit, 'has no drawn parts');
  return { meshes: out };
}

/** A value as given, or the kit's default for that parameter. */
export function valueOf(declaration: KitDeclaration, values: ParamValues, param: string): ParamValue | undefined {
  const given = values[param];
  return given === undefined ? declaration.defaults[param] : given;
}

/** Whether a part is drawn at these values. */
export function shows(part: KitMeshSpec, declaration: KitDeclaration, values: ParamValues): boolean {
  for (const condition of part.conditions) {
    const value = valueOf(declaration, values, condition.param);
    if (value === undefined || !condition.visibleWhen.includes(value)) return false;
  }
  return true;
}

/**
 * Morph weights of a part at these values, written into `out` (one per target). A size sits on the
 * straight line from its default to one end, so the target on the value's side of the default gets
 * the fraction of the way there and the other end stays at zero.
 */
export function weights(kit: string, part: KitMeshSpec, declaration: KitDeclaration, values: ParamValues, out: Float32Array | number[]): void {
  for (const target of part.targets) {
    const size = declaration.sizes[target.param] ?? fail(kit, `size ${target.param} is not declared`);
    const raw = valueOf(declaration, values, target.param);
    const value = typeof raw === 'number' ? raw : size.default;
    if (value < size.min - 1e-9 || value > size.max + 1e-9) fail(kit, `${target.param} = ${value} is outside ${size.min} to ${size.max}`);
    const span = target.value - size.default, offset = value - size.default;
    out[target.index] = span !== 0 && offset / span > 0 ? Math.min(1, offset / span) : 0;
  }
}
