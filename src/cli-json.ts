/**
 * The CLI's one --json rule. Receipt commands turn their output into a JSON receipt;
 * commands whose output is JSON already accept the switch and ignore it; commands with
 * no JSON output refuse it with this message. Receipt parsers own their own --json.
 */
export const JSON_OPTION_MESSAGE =
  '--json prints a JSON receipt from render, source, export, discover, inspect, animation and service status|reprobe; edit, save, collections, assets, asset, import, project, material, review and migrate print JSON already and accept it. generate, view, collections add and service start|stop print no JSON.';

const PRINTS_JSON = new Set([
  'save',
  'collections',
  'assets',
  'asset',
  'import',
  'project',
  'material',
  'review',
  'migrate',
]);

/** Apply the rule before a command's own parser reads argv. */
export function applyJsonOption(argv: readonly string[]): readonly string[] {
  if (!argv.includes('--json')) return argv;
  const rest = argv.filter((arg) => arg !== '--json');
  const [command, action] = rest;
  if (command === 'view' || (command === 'collections' && action === 'add'))
    throw new Error(JSON_OPTION_MESSAGE);
  return PRINTS_JSON.has(command ?? '') ? rest : argv;
}
