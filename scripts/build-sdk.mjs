#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/async';
import { SyntaxKind } from 'typescript/unstable/ast';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const posix = (path) => path.split(sep).join('/');
const declarationPath = (path) => path.replace(/\.js$/, '.d.ts');

async function filesIn(root) {
  const files = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    const path = join(root, item.name);
    if (item.isDirectory()) files.push(...(await filesIn(path)));
    else files.push(path);
  }
  return files;
}

function moduleLiterals(node, visit) {
  if (node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ExportDeclaration)
    visit(node.moduleSpecifier);
  if (node.kind === SyntaxKind.CallExpression && node.expression.kind === SyntaxKind.ImportKeyword)
    visit(node.arguments[0]);
  if (node.kind === SyntaxKind.ImportType) visit(node.argument.literal);
  node.forEachChild((child) => {
    moduleLiterals(child, visit);
  });
}

/** Emit with the pinned compiler CLI; parse emitted modules to resolve ESM paths. */
export async function buildSdk(root = repo) {
  root = resolve(root);
  const lib = join(root, 'lib');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const entries = {};
  const roots = [];
  for (const [name, contract] of Object.entries(pkg.exports)) {
    const target = typeof contract === 'string' ? contract : contract.import;
    if (!/^\.\/(?:src\/.+\.ts|lib\/.+\.js)$/.test(target ?? ''))
      throw new Error(`Unsupported SDK entry ${name}: ${target}`);
    const source = target.replace(/^\.\/lib\//, './src/').replace(/\.js$/, '.ts');
    const output = source.replace(/^\.\/src\//, './lib/').replace(/\.ts$/, '.js');
    const sourcePath = resolve(root, source);
    if (!sourcePath.startsWith(`${join(root, 'src')}${sep}`))
      throw new Error(`SDK entry escapes src/: ${name}`);
    roots.push(sourcePath);
    entries[name] = { types: declarationPath(output), import: output };
  }
  await mkdir(join(root, '.cache'), { recursive: true });
  const stage = await mkdtemp(join(root, '.cache', 'sdk-'));
  const out = join(stage, 'output');
  const config = join(stage, 'emit.json');
  const rootConfig = join(root, 'tsconfig.json');
  const compilerOptions = {
    target: 'ES2022',
    lib: ['ESNext', 'DOM'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: true,
    allowJs: true,
    checkJs: false,
    noEmit: false,
    noEmitOnError: true,
    declaration: true,
    emitDeclarationOnly: false,
    declarationMap: false,
    sourceMap: false,
    rewriteRelativeImportExtensions: true,
    rootDir: root,
    outDir: out,
  };
  let api;
  try {
    await writeFile(
      config,
      JSON.stringify({
        ...(existsSync(rootConfig) ? { extends: rootConfig } : {}),
        compilerOptions,
        files: roots,
        include: [posix(join(root, 'src/**/*.d.ts'))],
      }),
    );
    execFileSync('node', [tsc, '--project', config], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    const outputs = await filesIn(out);
    const declaration = (path) => /\.d\.(?:ts|mts)$/.test(path);
    const targetPath = (path, types) => {
      const name = relative(out, path);
      if (name.startsWith(`src${sep}`)) return join(lib, name.slice(4));
      return types ? join(lib, '_types', name) : join(root, name);
    };
    const scripts = outputs.filter((path) => /\.(?:js|mjs|ts|mts)$/.test(path));
    const parseConfig = join(stage, 'parse.json');
    await writeFile(
      parseConfig,
      JSON.stringify({
        compilerOptions: {
          allowJs: true,
          noEmit: true,
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
        files: scripts,
      }),
    );
    api = new API({ cwd: root });
    const snapshot = await api.updateSnapshot({ openProjects: [parseConfig] });
    const project = snapshot.getProject(parseConfig);
    const emitted = new Map();
    for (const path of outputs) {
      const types = declaration(path);
      if (!relative(out, path).startsWith(`src${sep}`) && !types) continue;
      let body = await readFile(path, 'utf8');
      if (scripts.includes(path)) {
        const sourceFile = await project.program.getSourceFile(path);
        if (!sourceFile) throw new Error(`Cannot parse emitted SDK module: ${path}`);
        const edits = [];
        moduleLiterals(sourceFile, (literal) => {
          if (
            !literal ||
            literal.kind !== SyntaxKind.StringLiteral ||
            !literal.text.startsWith('.')
          )
            return;
          const base = resolve(dirname(path), literal.text);
          const resolved = [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')].find(
            (candidate) => outputs.includes(candidate),
          );
          if (!resolved) throw new Error(`Unresolved emitted import ${literal.text} in ${path}`);
          let specifier = posix(
            relative(dirname(targetPath(path, types)), targetPath(resolved, types)),
          );
          if (!specifier.startsWith('.')) specifier = `./${specifier}`;
          edits.push({
            start: literal.getStart(sourceFile),
            end: literal.end,
            value: JSON.stringify(specifier),
          });
        });
        for (const edit of edits.sort((a, b) => b.start - a.start))
          body = body.slice(0, edit.start) + edit.value + body.slice(edit.end);
      }
      emitted.set(targetPath(path, types), body);
    }
    const libraryStage = join(stage, 'library');
    const previousLibrary = join(stage, 'previous-library');
    for (const [path, body] of emitted) {
      if (!path.startsWith(`${lib}${sep}`)) throw new Error('SDK output escapes lib/.');
      const stagedPath = join(libraryStage, relative(lib, path));
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, body);
    }
    // Both targets are fixed descendants of the resolved build root. Replace the
    // generated directory only after compilation and import validation succeed.
    const hadPrevious = existsSync(lib);
    if (hadPrevious) await rename(lib, previousLibrary);
    try {
      await rename(libraryStage, lib);
    } catch (error) {
      if (hadPrevious) await rename(previousLibrary, lib);
      throw error;
    }
    return { entries, files: [...emitted.keys()].map((path) => posix(relative(root, path))) };
  } finally {
    await api?.close();
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildSdk();
    console.log(
      `SDK: ${Object.keys(result.entries).length} entrypoints, ${result.files.length} files.`,
    );
  } catch (error) {
    console.error(error.stdout || error.message);
    process.exitCode = 1;
  }
}
