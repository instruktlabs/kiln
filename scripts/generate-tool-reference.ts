import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { FileProgramStore } from '../src/program-store-node';
import { createKilnProgramToolRegistry } from '../src/tools/registry';

export const toolReferencePath = fileURLToPath(new URL('../docs/tools.md', import.meta.url));

/**
 * The published tool reference, derived from the registry.
 *
 * Exported so the drift check can be a test rather than a command nobody runs.
 * `--check` existed from the start and appeared in no workflow and no test, which
 * is how `docs/tools.md` came to understate every tuple schema for a week: zod
 * 4.6.2 changed `z.toJSONSchema` to emit `items: false`, `minItems` and
 * `maxItems` for fixed-length tuples, the in-range bump took it, and the only
 * thing that would have noticed was opt-in.
 */
export function toolReferenceMarkdown(): string {
  // The packaged server binds the file store, so the reference states its retention; the
  // directory is never touched here, only the descriptions are read.
  const tools = createKilnProgramToolRegistry({
    programStore: new FileProgramStore('.kiln/programs'),
  });
  return `${[
    '# Tool reference',
    'Generated from the public registry with `bun run docs:tools`. Change the registry to update names, descriptions or schemas; use `bun run docs:tools --check` to check for drift.',
    "Use these tools through your connected agent. Supply `code` once, then pass the returned `programRef` to later calls. References identify exact source revisions; the retention each description states is the packaged file store's, and an injected store states its own. [Source workflow](programs.md) · [Camera recipes](cameras.md) · [Geometry guide](geometry.md).",
    'Call `kiln_discover({capabilities:true})` for the current host limits and export/camera support. The schema below describes inputs; actual image replies include fidelity and capture metadata. Source reads return exact text, edits return a new revision, and failed builds return their errors.',
    'The packaged local host additionally injects kiln_project, kiln_material and kiln_review. Projects are optional. Authoring tools there accept projectId, projectRevision and independent materialDependencies; projectId:null explicitly selects standalone work. These optional schemas come from the same registry and are advertised only when their host stores are available; connected tools/list is authoritative. See [projects and live review](projects-and-live-review.md) for CLI equivalents, project packages and exact reviewed saves. The base schemas below remain available to embeddings without workspace services.',
    'Renderer capabilities distinguish configured routing, dependency readiness, endpoint health and unverified authentication. Use kiln_renderer with action=reprobe after renderer setup or repair to refresh the current session. Material capabilities list approved texture IDs by allowed slot for the selected evaluator. Capability inspection never starts a renderer, requests an image or fetches texture bytes; ordinary catalog search is offline. See [renderer readiness and resources](rendering.md).',
    ...tools.flatMap((tool) => {
      const schema = z.toJSONSchema(tool.inputSchema);
      return [
        `## ${tool.name}`,
        tool.description,
        '<details>\n<summary>Input JSON Schema</summary>\n',
        `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n\n</details>`,
      ];
    }),
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
    console.log(
      `Wrote ${createKilnProgramToolRegistry().length} public tool definitions to docs/tools.md.`,
    );
  }
}
