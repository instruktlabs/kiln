/**
 * Static `kiln_validate` checks for author `userData` (R48).
 *
 * The build decides what exports (see `user-data-extras.ts`); this names the cases a source
 * shows before it runs: a write to a reserved `kiln*` key, a value that can never be JSON
 * (a function, a class, a `new` object, a bigint, a symbol, NaN or Infinity), and a literal
 * too large for one node or material. Written as warnings: the build still runs and leaves
 * those values out with its own named warning.
 */
import type * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { isReservedUserDataKey, MAX_USER_DATA_BYTES_PER_OBJECT } from './user-data-extras';

export interface UserDataIssue {
  code: 'USER_DATA_RESERVED_KEY' | 'USER_DATA_NOT_SERIALIZABLE' | 'USER_DATA_TOO_LARGE';
  message: string;
  fixHint: string;
  line?: number;
}

type Node = acorn.Node & Record<string, unknown>;
const NOT_STATIC = Symbol('not static');

const isUserDataMember = (node: Node | null | undefined): boolean =>
  node?.type === 'MemberExpression' &&
  !(node.computed as boolean) &&
  (node.property as Node).type === 'Identifier' &&
  (node.property as Node).name === 'userData';

/** A key named by an identifier, a string literal or a template without expressions. */
function staticKey(node: Node, computed: boolean): string | undefined {
  if (!computed && node.type === 'Identifier') return node.name as string;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && (node.expressions as Node[]).length === 0)
    return ((node.quasis as Node[])[0]!.value as { cooked: string }).cooked;
  return undefined;
}

/** Why a value expression can never be JSON, or undefined when it may be. */
function nonJsonExpression(node: Node): string | undefined {
  switch (node.type) {
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return 'a function';
    case 'ClassExpression':
      return 'a class';
    case 'NewExpression': {
      const callee = node.callee as Node;
      const name =
        callee.type === 'Identifier'
          ? (callee.name as string)
          : callee.type === 'MemberExpression' && (callee.property as Node).type === 'Identifier'
            ? ((callee.property as Node).name as string)
            : undefined;
      return name ? `a ${name}` : 'a constructed object';
    }
    case 'Literal':
      if (typeof node.bigint === 'string') return 'a bigint';
      if (node.regex) return 'a regular expression';
      return undefined;
    case 'Identifier':
      if (node.name === 'NaN' || node.name === 'Infinity')
        return `a non-finite number (${node.name})`;
      return undefined;
    case 'CallExpression': {
      const callee = node.callee as Node;
      return callee.type === 'Identifier' && callee.name === 'Symbol' ? 'a symbol' : undefined;
    }
    case 'ArrayExpression':
      for (const element of node.elements as (Node | null)[]) {
        if (element && element.type !== 'SpreadElement') {
          const reason = nonJsonExpression(element);
          if (reason) return reason;
        }
      }
      return undefined;
    case 'ObjectExpression':
      for (const property of node.properties as Node[]) {
        if (property.type !== 'Property') continue;
        if (property.kind !== 'init' || property.method) return 'an accessor or method';
        const reason = nonJsonExpression(property.value as Node);
        if (reason) return reason;
      }
      return undefined;
    default:
      return undefined;
  }
}

/** The JSON value of a fully literal expression, or NOT_STATIC. */
function staticValue(node: Node): unknown {
  switch (node.type) {
    case 'Literal':
      return typeof node.bigint === 'string' || node.regex ? NOT_STATIC : node.value;
    case 'TemplateLiteral':
      return (node.expressions as Node[]).length === 0
        ? ((node.quasis as Node[])[0]!.value as { cooked: string }).cooked
        : NOT_STATIC;
    case 'UnaryExpression': {
      if (node.operator !== '-') return NOT_STATIC;
      const inner = staticValue(node.argument as Node);
      return typeof inner === 'number' ? -inner : NOT_STATIC;
    }
    case 'ArrayExpression': {
      const out: unknown[] = [];
      for (const element of node.elements as (Node | null)[]) {
        if (!element || element.type === 'SpreadElement') return NOT_STATIC;
        const value = staticValue(element);
        if (value === NOT_STATIC) return NOT_STATIC;
        out.push(value);
      }
      return out;
    }
    case 'ObjectExpression': {
      const out: Record<string, unknown> = {};
      for (const property of node.properties as Node[]) {
        if (property.type !== 'Property') return NOT_STATIC;
        const key = staticKey(property.key as Node, property.computed as boolean);
        if (key === undefined) return NOT_STATIC;
        const value = staticValue(property.value as Node);
        if (value === NOT_STATIC) return NOT_STATIC;
        out[key] = value;
      }
      return out;
    }
    default:
      return NOT_STATIC;
  }
}

const bytesOf = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

/** userData findings in source order. */
export function analyzeUserData(ast: acorn.Program): UserDataIssue[] {
  const found: Array<UserDataIssue & { at: number }> = [];
  const lineOf = (node: acorn.Node) => node.loc?.start.line;

  const checkEntry = (key: string, value: Node, at: acorn.Node) => {
    if (isReservedUserDataKey(key)) {
      found.push({
        code: 'USER_DATA_RESERVED_KEY',
        message: `userData.${key} uses the reserved kiln prefix; the engine owns kiln* keys and never exports an author's.`,
        fixHint: 'Rename the key without the kiln prefix to export it as glTF extras.',
        line: lineOf(at),
        at: at.start,
      });
      return;
    }
    const reason = nonJsonExpression(value);
    if (reason) {
      found.push({
        code: 'USER_DATA_NOT_SERIALIZABLE',
        message: `userData.${key} is ${reason}, which is not JSON; the export leaves it out of glTF extras.`,
        fixHint:
          'Store plain JSON in userData: null, booleans, finite numbers, strings, arrays and plain objects (vector.toArray() for a vector).',
        line: lineOf(at),
        at: at.start,
      });
      return;
    }
    const literal = staticValue(value);
    if (literal === NOT_STATIC) return;
    const bytes = bytesOf({ [key]: literal });
    if (bytes > MAX_USER_DATA_BYTES_PER_OBJECT)
      found.push({
        code: 'USER_DATA_TOO_LARGE',
        message: `userData.${key} is ${bytes} bytes of JSON; a node or material exports at most ${MAX_USER_DATA_BYTES_PER_OBJECT}.`,
        fixHint: 'Keep extras to flags, tags and ids; ship bulk data beside the GLB.',
        line: lineOf(at),
        at: at.start,
      });
  };

  const checkObject = (object: Node) => {
    for (const property of object.properties as Node[]) {
      if (property.type !== 'Property') continue;
      const key = staticKey(property.key as Node, property.computed as boolean);
      if (key !== undefined) checkEntry(key, property.value as Node, property);
    }
  };

  walk.simple(ast, {
    AssignmentExpression(node) {
      const assignment = node as unknown as Node;
      if (assignment.operator !== '=') return;
      const left = assignment.left as Node;
      const right = assignment.right as Node;
      if (left.type !== 'MemberExpression') return;
      if (isUserDataMember(left.object as Node)) {
        const key = staticKey(left.property as Node, left.computed as boolean);
        if (key !== undefined) checkEntry(key, right, node);
      } else if (isUserDataMember(left) && right.type === 'ObjectExpression') checkObject(right);
    },
    CallExpression(node) {
      const call = node as unknown as Node;
      const callee = call.callee as Node;
      const args = call.arguments as Node[];
      if (
        callee.type === 'MemberExpression' &&
        (callee.object as Node).type === 'Identifier' &&
        (callee.object as Node).name === 'Object' &&
        (callee.property as Node).type === 'Identifier' &&
        (callee.property as Node).name === 'assign' &&
        isUserDataMember(args[0])
      )
        for (const source of args.slice(1))
          if (source.type === 'ObjectExpression') checkObject(source);
    },
  });
  return found.sort((a, b) => a.at - b.at).map(({ at: _at, ...issue }) => issue);
}
