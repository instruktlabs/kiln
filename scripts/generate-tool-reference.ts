import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packagedMcpManifest } from '../src/mcp-manifest';

export const toolReferencePath = fileURLToPath(new URL('../docs/tools.md', import.meta.url));

/**
 * The published tool reference: the definitions the packaged server advertises,
 * byte for byte the manifest's (`src/generated/mcp-manifest.json`), pretty-printed.
 *
 * Exported so the drift check can be a test rather than a command nobody runs.
 * `--check` existed from the start and appeared in no workflow and no test, which
 * is how `docs/tools.md` came to understate every tuple schema for a week: zod
 * 4.6.2 changed `z.toJSONSchema` to emit `items: false`, `minItems` and
 * `maxItems` for fixed-length tuples, the in-range bump took it, and the only
 * thing that would have noticed was opt-in.
 */
export function toolReferenceMarkdown(): string {
  const manifest = packagedMcpManifest();
  return `${[
    '# Tool reference',
    'Generated with `bun run docs:tools` from the definitions the packaged stdio server advertises (the same bytes as `src/generated/mcp-manifest.json`). Change the registry in `src/tools/registry.ts` to update names, descriptions or schemas; `bun run docs:tools --check` reports drift.',
    'Use these tools through your connected agent. Supply `code` once (or `file`, a path inside the workspace), then pass the returned `programRef` to later calls. References identify exact source revisions and are kept in the workspace program store across sessions and processes. [Source workflow](programs.md) · [Camera recipes](cameras.md) · [Geometry guide](geometry.md).',
    'Call `kiln_discover({capabilities:true})` for the current host limits, the configured project and export/camera support. Nested records that the schemas keep opaque (`draft`, `patch`, `payload`, `capture`, `shot`) are described in full by `kiln_discover({ ids: ["shape:project-draft"] })` and the other `shape:` entries. The schema below describes inputs; actual image replies include fidelity and capture metadata. Source reads return exact text, edits return a new revision, and failed builds return their errors.',
    'kiln_project, kiln_material and kiln_review are injected by the packaged local host; an embedding advertises them only when it supplies the corresponding store, and the connected tools/list is authoritative. Projects are optional: authoring tools accept projectId, projectRevision and independent materialDependencies, and projectId:null selects standalone work. See [projects and live review](projects-and-live-review.md) for CLI equivalents, project packages and exact reviewed saves.',
    'Renderer capabilities distinguish configured routing, dependency readiness, endpoint health and unverified authentication. Use kiln_renderer with action=reprobe after renderer setup or repair to refresh the current session. Material capabilities list approved texture IDs by allowed slot for the selected evaluator. Capability inspection never starts a renderer, requests an image or fetches texture bytes; ordinary catalog search is offline. See [renderer readiness and resources](rendering.md).',
    ...manifest.tools.flatMap((tool) => [
      `## ${tool.name}`,
      tool.description,
      '<details>\n<summary>Input JSON Schema</summary>\n',
      `\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\`\n\n</details>`,
    ]),
  ].join('\n\n')}\n`;
}

// Only when run as a command. Importing this module must not write a file or set
// an exit code -- the test below it imports the builder.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const content = toolReferenceMarkdown();
  if (process.argv.includes('--check')) {
    if ((await readFile(toolReferencePath, 'utf8').catch(() => '')) !== content) {
      console.error('Tool reference differs from the registry. Run bun run docs:tools.');
      process.exitCode = 1;
    }
  } else {
    await writeFile(toolReferencePath, content);
    console.log(`Wrote ${packagedMcpManifest().tools.length} tool definitions to docs/tools.md.`);
  }
}
