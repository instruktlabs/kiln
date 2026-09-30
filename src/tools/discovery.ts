import { engineIdentity } from '../engine-identity';
import { createDiscovery, discoveryInputSchema } from '../discovery';
import type { DiscoveryResponse } from '../discovery';
import { DISCOVERY_INDEX_VERSION } from '../discovery/lexical-index';
import type { KilnToolContext, KilnToolDef } from './registry';
import { MAX_PROGRAM_BYTES } from '../program-store';
import { MAX_EVALUATOR_CODE_BYTES } from '../evaluator/protocol';
import { MAX_CAPTURE_SHOT_SIZE, resolveCaptureLimits } from '../views/capture-limits';
import { geometryExportAttributes } from '../geometry-export';
import { resolveGltfExporter } from '../community-exporter';
import { approvedTextureCatalogV1 } from '../material-resources';

/** Shared native tool definition; all transports use the same Discovery service. */
export function createKilnDiscoveryDef(context: KilnToolContext): KilnToolDef {
  const run = createDiscovery(() => currentCapabilities(context));
  return {
    name: 'kiln_discover',
    description:
      'Discover Kiln operations, assemblies, recipes and current host capabilities. Omit arguments for a compact overview. Search with ordinary modeling language using query; refine with family, kind or tags. Fetch complete contracts/examples with ids (up to six exact IDs or executable names). Overview/search pages default to six summaries. Recipes guide construction without restricting the asset. Search runs locally without models or network calls.',
    inputSchema: discoveryInputSchema,
    run,
    text: (output) => {
      const { text, textTruncated, ...structured } = output as DiscoveryResponse;
      // Both agent skins use this presentation. Long contracts must retain
      // their complete structured fields rather than expose only a cut preview.
      if (textTruncated) return JSON.stringify(structured);
      return structured.suggestions?.length
        ? `${text}\nSuggestions: ${structured.suggestions.join(', ')}`
        : text;
    },
  };
}

async function currentCapabilities(context: KilnToolContext) {
  const externalEvaluator =
    Boolean(context.evaluatorPort) || context.evaluatorProfile === 'evaluator-required';
  const approvedTextures = context.approvedTextureResources
    ? context.approvedTextureResources()
    : externalEvaluator
      ? null
      : approvedTextureCatalogV1();
  // IDs grouped by permitted slot keep the capability reply useful and compact;
  // labels and recipe copies would repeat the same material set three times.
  const textureSlots: Record<string, string[]> | null = approvedTextures === null ? null : {};
  for (const entry of approvedTextures ?? []) {
    for (const slot of entry.allowedSlots) {
      textureSlots![slot] ??= [];
      textureSlots![slot].push(entry.id);
    }
  }
  const renderer = context.renderCapabilities
    ? await context.renderCapabilities()
    : {
        mode: context.viewRenderPort ? 'host-injected' : context.viewRenderRequired ? 'gpu' : 'cpu',
        target: context.viewRenderPort ? 'host-injected' : 'cpu',
        configured: Boolean(context.viewRenderPort),
        required: Boolean(context.viewRenderRequired),
        status: context.viewRenderPort
          ? 'unknown'
          : context.viewRenderRequired
            ? 'unavailable'
            : 'disabled',
        evidence: 'host-unspecified',
      };
  // Local hosts capture their defaults; external evaluators must declare theirs.
  // A cached evaluator wrapper is not an external host: callers supply the
  // original context here before wrapping it.
  const declared = context.assetBuildOptions?.gltfExporter;
  const exporter =
    declared === 'legacy' || declared === 'three'
      ? declared
      : context.evaluatorPort || context.evaluatorProfile === 'evaluator-required'
        ? undefined
        : resolveGltfExporter();
  return {
    version: 'kiln.capabilities.v1',
    discovery: {
      index: DISCOVERY_INDEX_VERSION,
      mode: 'lexical',
      offline: true,
      requiresModel: false,
    },
    // Which installation answered. A server named `kiln` may be a different
    // one, and until this field existed nothing in a tool result could tell
    // you -- so the workspace guide's "do not substitute it silently" had
    // nothing to check against. Compare with `runtime` in .kiln/workspace.json.
    engine: engineIdentity(),
    renderer,
    execution:
      context.localExecution ??
      (context.evaluatorPort
        ? { mode: 'host-injected', limits: 'unspecified by host' }
        : context.evaluatorProfile === 'evaluator-required'
          ? { mode: 'host-required', available: false }
          : { mode: 'trusted-local', terminable: false }),
    source: {
      ...(context.programStore?.stats ? { storage: await context.programStore.stats() } : {}),
      maxBytes: MAX_PROGRAM_BYTES,
      transportEvaluatorMaxBytes: MAX_EVALUATOR_CODE_BYTES,
      immutableRevisions: true,
      boundedRead: true,
      atomicEdit: true,
    },
    assets: {
      available: Boolean(context.assetLibrary),
      collections: context.assetLibrary?.collections() ?? [],
      save: 'kiln_save persists exact GLB, source and provenance; draft renders do not populate collections',
      resume: 'kiln_assets action=restore imports a saved revision into the current program store',
      downloads: 'kiln_export returns GLB/source/ZIP resource links; client presentation varies',
      viewer:
        'kiln_present opens a saved revision in supporting chat clients with 3D viewing and downloads; kiln view opens a local collection or standalone GLB/ZIP',
    },
    geometry: {
      exporter: exporter ?? 'unspecified-by-host',
      attributes: exporter ? Object.keys(geometryExportAttributes(exporter)) : null,
      experimentalExporter: exporter === undefined ? null : exporter === 'three',
      indexedTriangles: true,
      materialGroups: true,
      skinning: exporter === undefined ? null : exporter === 'three',
      morphAttributes:
        exporter === undefined ? null : exporter === 'three' ? ['position', 'normal'] : [],
      unsupported:
        exporter === undefined
          ? null
          : exporter === 'three'
            ? ['custom attributes', 'UV4+', 'morph attributes other than position/normal']
            : ['vertex colors', 'UV1+', 'skinning', 'morphs', 'custom attributes'],
      strictExport:
        'geometryPolicy:strict on GLB export or host context; local KILN_GEOMETRY_POLICY=strict',
      implicitSurfaces: 'experimental',
    },
    camera: {
      version: 'kiln.capture.v1',
      maxShots: 9,
      cellSize: [128, MAX_CAPTURE_SHOT_SIZE],
      output: ['grid', 'separate'],
      projection: ['orthographic', 'perspective'],
      subjects: ['asset', 'exact node path', 'unambiguous name'],
      visibility: ['context', 'isolate'],
      orbitFrames: ['world', 'asset', 'part'],
      explicitFrames: ['world', 'asset', 'part', 'local'],
      framing: ['explicit', 'bounds'],
      lens: {
        perspective: 'fovDeg: vertical field of view in degrees, default 50',
        orthographic: 'halfHeight: half the view height in world units',
      },
      clip: 'near and far in world units. An explicit perspective near defaults to half the distance to the nearest geometry (at least 0.001); pass near to override it.',
      limits: resolveCaptureLimits(context.captureLimits),
      defaultViews: 6,
    },
    materials: {
      approvedTextures: textureSlots,
      approvedTextureCount: approvedTextures?.length ?? null,
      resourceScope: context.localExecution
        ? context.localExecution.mode === 'in-process'
          ? 'in-process'
          : 'embedded-only'
        : context.approvedTextureResources
          ? 'host-declared'
          : externalEvaluator
            ? 'unspecified-by-host'
            : 'in-process',
      resourceEvidence: approvedTextures === null ? 'unspecified-by-host' : 'configuration-only',
      placeholders: 'excluded',
      gpuPortConfigured: renderer.configured,
      gpuRequired: renderer.required,
      deliveredEvidence: 'viewFidelity and per-cell cameraFidelity',
      cpu: 'geometry/base color',
    },
  };
}
