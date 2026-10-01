/** Workbench syntax colours share the site's paper, ink, ember and wire tokens. */
export const workbenchTheme = {
  name: 'workbench',
  type: 'light' as const,
  colors: { 'editor.foreground': '#292d29', 'editor.background': '#f7f3eb' },
  settings: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#625e55', fontStyle: 'italic' },
    },
    { scope: ['keyword', 'storage', 'entity.name.function'], settings: { foreground: '#a44024' } },
    {
      scope: ['string', 'constant.numeric', 'constant.language'],
      settings: { foreground: '#1f6466' },
    },
    { scope: ['variable', 'entity.name.type', 'support'], settings: { foreground: '#292d29' } },
    { scope: ['punctuation'], settings: { foreground: '#625e55' } },
  ],
};
export const workbenchContrast = {
  name: 'workbench-contrast',
  pre(node: { properties: Record<string, unknown> }) {
    delete node.properties.tabindex;
  },
};
