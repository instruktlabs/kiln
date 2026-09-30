import {
  Extension,
  ExtensionProperty,
  type IProperty,
  type Material,
  type Node,
  type Nullable,
  PropertyType,
  type ReaderContext,
  RefList,
  WebIO,
  type WriterContext,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

export const MSFT_LOD = 'MSFT_lod';

interface ILod extends IProperty {
  levels: RefList<Node | Material>;
}

interface LodDef {
  ids?: unknown;
}

/**
 * The lower levels of an `MSFT_lod` chain, attached to the highest-detail node or material.
 * Levels are references, not indices, so the ids written back stay valid when a pass
 * reorders, merges or prunes properties; prune keeps a level because this refers to it.
 */
export class Lod extends ExtensionProperty<ILod> {
  public static override EXTENSION_NAME: typeof MSFT_LOD = MSFT_LOD;
  declare public extensionName: typeof MSFT_LOD;
  declare public propertyType: 'Lod';
  declare public parentTypes: [PropertyType.NODE, PropertyType.MATERIAL];

  protected init(): void {
    this.extensionName = MSFT_LOD;
    this.propertyType = 'Lod';
    this.parentTypes = [PropertyType.NODE, PropertyType.MATERIAL];
  }

  protected override getDefaults(): Nullable<ILod> {
    return Object.assign(super.getDefaults() as IProperty, {
      levels: new RefList<Node | Material>(),
    });
  }

  public addLevel(level: Node | Material): this {
    return this.addRef('levels', level);
  }

  public listLevels(): (Node | Material)[] {
    return this.listRefs('levels');
  }
}

/**
 * `MSFT_lod` (vendor extension, not in `ALL_EXTENSIONS`): a node or material lists lower
 * levels of detail by index. Unregistered, the reader dropped the chain and prune then
 * deleted the off-scene level nodes, so an imported LOD asset lost its levels on re-save.
 * Screen-coverage extras ride on node extras and need nothing here.
 */
export class MSFTLod extends Extension {
  public override readonly extensionName: typeof MSFT_LOD = MSFT_LOD;
  public static override readonly EXTENSION_NAME: typeof MSFT_LOD = MSFT_LOD;

  public createLod(name = ''): Lod {
    return new Lod(this.document.getGraph(), name);
  }

  public read(context: ReaderContext): this {
    const json = context.jsonDoc.json;
    this.readLevels(json.nodes, context.nodes);
    this.readLevels(json.materials, context.materials);
    return this;
  }

  private readLevels<T extends Node | Material>(
    defs: readonly { extensions?: Record<string, unknown> }[] | undefined,
    targets: readonly T[],
  ): void {
    (defs ?? []).forEach((def, index) => {
      const ids = (def.extensions?.[MSFT_LOD] as LodDef | undefined)?.ids;
      const target = targets[index];
      if (!target || !Array.isArray(ids)) return;
      const lod = this.createLod();
      for (const id of ids) {
        const level = typeof id === 'number' ? targets[id] : undefined;
        if (level && level !== target) lod.addLevel(level);
      }
      target.setExtension(MSFT_LOD, lod);
    });
  }

  public write(context: WriterContext): this {
    const json = context.jsonDoc.json;
    const root = this.document.getRoot();
    for (const node of root.listNodes()) {
      const index = context.nodeIndexMap.get(node);
      const ids = node
        .getExtension<Lod>(MSFT_LOD)
        ?.listLevels()
        .filter((level): level is Node => level.propertyType === PropertyType.NODE)
        .map((level) => context.nodeIndexMap.get(level))
        .filter((id): id is number => id !== undefined);
      const def = index === undefined ? undefined : json.nodes?.[index];
      if (def && ids?.length) def.extensions = { ...def.extensions, [MSFT_LOD]: { ids } };
    }
    for (const material of root.listMaterials()) {
      const index = context.materialIndexMap.get(material);
      const ids = material
        .getExtension<Lod>(MSFT_LOD)
        ?.listLevels()
        .filter((level): level is Material => level.propertyType === PropertyType.MATERIAL)
        .map((level) => context.materialIndexMap.get(level))
        .filter((id): id is number => id !== undefined);
      const def = index === undefined ? undefined : json.materials?.[index];
      if (def && ids?.length) def.extensions = { ...def.extensions, [MSFT_LOD]: { ids } };
    }
    return this;
  }
}

/** Keep standard extensions, plus `MSFT_lod` chains, through every document round trip.
 * Codec-dependent extensions still require their decoder; registration does not invent one. */
export function createGltfIO(): WebIO {
  return new WebIO().registerExtensions([...ALL_EXTENSIONS, MSFTLod]);
}
