export interface DocDefinition {
  slug: string;
  label: string;
  description: string;
  optional?: boolean;
}

/** This allowlist is the complete publishing policy: internal records never become pages. */
export const DOC_GROUPS: { title: string; description: string; pages: DocDefinition[] }[] = [
  {
    title: 'Start',
    description: 'Install Kiln and connect an asset workspace to your agent.',
    pages: [
      {
        slug: 'install',
        label: 'Install Kiln',
        description: 'Installation, workspace setup and a first connection check.',
      },
      {
        slug: 'clean-room',
        label: 'Asset workspaces',
        description: 'Keep asset authoring in a separate workspace with its own source and skills.',
      },
      {
        slug: 'harnesses',
        label: 'Agent harnesses',
        description: 'Run and verify the coding agents that drive Kiln.',
      },
    ],
  },
  {
    title: 'Use',
    description: 'Build a program, inspect the result and retain the revision you reviewed.',
    pages: [
      {
        slug: 'programs',
        label: 'Source revisions',
        description: 'Immutable program references, source reads and anchored edits.',
      },
      {
        slug: 'geometry',
        label: 'Geometry',
        description:
          'Shape geometry with primitives, curves, assemblies and constructive operations.',
      },
      {
        slug: 'cameras',
        label: 'Cameras',
        description: 'Choose useful views for an asset and its individual parts.',
      },
      {
        slug: 'rendering',
        label: 'Rendering and materials',
        description: 'GPU rendering, CPU fallback and evidence for material review.',
      },
      {
        slug: 'collections',
        label: 'Saved assets',
        description: 'Save revisions, browse collections and open the local viewer.',
      },
      {
        slug: 'projects-and-live-review',
        label: 'Projects and Live Review',
        description: 'Optional project configuration, exact revision pins and owner review.',
        optional: true,
      },
      {
        slug: 'material-library',
        label: 'Material library',
        description: 'Material records, texture maps and deterministic procedural recipes.',
        optional: true,
      },
      {
        slug: 'export-profiles',
        label: 'Export profiles',
        description: 'Choose editable exports or a runtime GLB with provenance metadata.',
      },
      {
        slug: 'runtime',
        label: 'Execution and reuse',
        description: 'Runtime boundaries, persistence and the optional native agent workflow.',
      },
      {
        slug: 'chatgpt',
        label: 'ChatGPT',
        description: 'Connect Kiln to ChatGPT and use its visual asset tools.',
      },
      {
        slug: 'google',
        label: 'Google agents',
        description: 'Use Kiln with Google agent environments.',
      },
    ],
  },
  {
    title: 'Reference',
    description: 'Tool contracts and integration details from the engine repository.',
    pages: [
      {
        slug: 'tools',
        label: 'Tool reference',
        description: 'Tool schemas, parameters and returned data.',
      },
      {
        slug: 'extending',
        label: 'Extend Kiln',
        description: 'Add parts and integrate Kiln with your own applications.',
      },
      {
        slug: 'architecture',
        label: 'Library and architecture',
        description: 'The TypeScript library and the boundaries between engine and hosts.',
      },
      {
        slug: 'migration',
        label: 'Migration',
        description: 'Update existing tool, evaluator and rendering integrations.',
      },
    ],
  },
];

export const DOC_PAGES = DOC_GROUPS.flatMap((group) =>
  group.pages.map((page) => ({ ...page, group: group.title })),
);
