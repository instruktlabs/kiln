/**
 * Static checks for two build-time throws that the worker boundary reports only
 * by a closed cause: a lexical binding read before its declaration runs, and a
 * materialRecipe call whose literal ID or override key the recipe does not list.
 *
 * Both checks favour silence over a false report. The temporal-dead-zone check
 * flags a read only when it runs immediately in the same function as the
 * declaration and sits before the end of that declaration; reads inside a
 * nested function or instance field run later and are left to the runtime.
 */
import type * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import {
  MATERIAL_RECIPE_IDS,
  MATERIAL_RECIPE_LIBRARY_V1,
  type MaterialRecipeId,
} from './material-recipes';
import type { ValidationIssue } from './validation';

type Node = acorn.Node & Record<string, unknown>;
type Binding = { tdz: true; end: number; line?: number } | 'shadow';

function patternNames(pattern: unknown, names: string[] = []): string[] {
  const node = pattern as Node | null;
  if (!node) return names;
  if (node.type === 'Identifier') names.push(node['name'] as string);
  else if (node.type === 'ObjectPattern')
    for (const property of node['properties'] as Node[])
      patternNames(
        property.type === 'RestElement' ? property['argument'] : property['value'],
        names,
      );
  else if (node.type === 'ArrayPattern')
    for (const element of node['elements'] as Node[]) patternNames(element, names);
  else if (node.type === 'AssignmentPattern') patternNames(node['left'], names);
  else if (node.type === 'RestElement') patternNames(node['argument'], names);
  return names;
}

function lexicalDeclarations(statements: Node[], name: string): Binding | undefined {
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration' && statement['kind'] !== 'var') {
      for (const declarator of statement['declarations'] as Node[])
        if (patternNames(declarator['id']).includes(name))
          return { tdz: true, end: declarator.end, line: declarator.loc?.start.line };
    } else if (
      (statement.type === 'ClassDeclaration' || statement.type === 'FunctionDeclaration') &&
      (statement['id'] as Node | null)?.['name'] === name
    ) {
      return statement.type === 'ClassDeclaration'
        ? { tdz: true, end: statement.end, line: statement.loc?.start.line }
        : 'shadow';
    }
  }
  return undefined;
}

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

/** The binding `scope` gives `name` for code under `child`, if it gives one. */
function bindingIn(scope: Node, child: Node, name: string): Binding | undefined {
  switch (scope.type) {
    case 'Program':
    case 'BlockStatement':
    case 'StaticBlock':
      return lexicalDeclarations(scope['body'] as Node[], name);
    case 'SwitchStatement':
      if (child === scope['discriminant']) return undefined;
      return lexicalDeclarations(
        (scope['cases'] as Node[]).flatMap((c) => c['consequent'] as Node[]),
        name,
      );
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement': {
      const head = (scope.type === 'ForStatement' ? scope['init'] : scope['left']) as Node | null;
      return head?.type === 'VariableDeclaration' &&
        head['kind'] !== 'var' &&
        (head['declarations'] as Node[]).some((d) => patternNames(d['id']).includes(name))
        ? 'shadow'
        : undefined;
    }
    case 'CatchClause':
      return patternNames(scope['param']).includes(name) ? 'shadow' : undefined;
    case 'ClassDeclaration':
    case 'ClassExpression':
      return (scope['id'] as Node | null)?.['name'] === name ? 'shadow' : undefined;
    default:
      if (!FUNCTION_TYPES.has(scope.type)) return undefined;
      if (scope.type === 'FunctionExpression' && (scope['id'] as Node | null)?.['name'] === name)
        return 'shadow';
      return (scope['params'] as Node[]).some((p) => patternNames(p).includes(name))
        ? 'shadow'
        : undefined;
  }
}

function temporalDeadZoneReads(ast: acorn.Program): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  walk.ancestor(ast, {
    Identifier(node, _state, ancestors) {
      const name = (node as unknown as { name: string }).name;
      let deferred = false;
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const scope = ancestors[i] as Node;
        const child = ancestors[i + 1] as Node;
        const binding = bindingIn(scope, child, name);
        if (binding === 'shadow') return;
        if (binding) {
          if (deferred || node.start >= binding.end) return;
          const line = node.loc?.start.line;
          const key = `${name}:${line}`;
          if (seen.has(key)) return;
          seen.add(key);
          issues.push({
            code: 'TEMPORAL_DEAD_ZONE',
            message: `\`${name}\` is read before its declaration${binding.line ? ` at line ${binding.line}` : ''} has run, so the read throws.`,
            fixHint:
              'Declare the binding above the first code that reads it, or read it inside a function that runs later.',
            line,
          });
          return;
        }
        // A function body or an instance field initializer runs later, not here.
        if (FUNCTION_TYPES.has(scope.type)) deferred = true;
        if (scope.type === 'PropertyDefinition' && !scope['static'] && child === scope['value'])
          deferred = true;
      }
    },
  });
  return issues;
}

function literalString(node: Node | undefined): string | undefined {
  if (node?.type === 'Literal' && typeof node['value'] === 'string') return node['value'];
  if (node?.type === 'TemplateLiteral' && (node['expressions'] as Node[]).length === 0)
    return ((node['quasis'] as Node[])[0]?.['value'] as { cooked?: string } | undefined)?.cooked;
  return undefined;
}

function recipeCalls(ast: acorn.Program): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  walk.simple(ast, {
    CallExpression(call) {
      const node = call as unknown as Node;
      const callee = node['callee'] as Node;
      if (callee.type !== 'Identifier' || callee['name'] !== 'materialRecipe') return;
      const [first, second] = node['arguments'] as Node[];
      const id = literalString(first);
      if (id === undefined) return;
      if (!Object.hasOwn(MATERIAL_RECIPE_LIBRARY_V1, id)) {
        issues.push({
          code: 'MATERIAL_RECIPE_ID',
          message: `${JSON.stringify(id)} is not a listed material recipe. Listed IDs: ${MATERIAL_RECIPE_IDS.join(', ')}.`,
          fixHint: 'Use a listed ID; kiln_discover with ids ["materialRecipe"] describes each.',
          line: node.loc?.start.line,
        });
        return;
      }
      if (second?.type !== 'ObjectExpression') return;
      const allowed: readonly string[] =
        MATERIAL_RECIPE_LIBRARY_V1[id as MaterialRecipeId].allowedOverrides;
      for (const property of second['properties'] as Node[]) {
        if (property.type !== 'Property' || property['computed']) continue;
        const key = property['key'] as Node;
        const name = key.type === 'Identifier' ? (key['name'] as string) : literalString(key);
        if (name === undefined || allowed.includes(name)) continue;
        issues.push({
          code: 'MATERIAL_RECIPE_OVERRIDE',
          message: `${id} does not accept the ${name} override; it accepts ${allowed.join(', ')}.`,
          fixHint:
            'Remove the override, or use a recipe whose allowed overrides include it (kiln_discover ids ["materialRecipe"]).',
          line: property.loc?.start.line,
        });
      }
    },
  });
  return issues;
}

/** Static issues for reads and recipe calls that would throw while build() runs. */
export function analyzeBuildTimeThrows(ast: acorn.Program): ValidationIssue[] {
  return [...temporalDeadZoneReads(ast), ...recipeCalls(ast)];
}
