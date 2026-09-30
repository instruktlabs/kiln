#!/usr/bin/env node
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertNodeRuntime } from '../src/runtime-support.mjs';

const installation = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quote = JSON.stringify;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const harnesses = ['claude', 'codex', 'opencode', 'hermes', 'agy', 'copilot', 'cursor-agent'];
/** Where each harness family actually looks for skills, relative to the workspace. */
const skillRegistries = ['.claude/skills', '.agents/skills'];
const core = ['kiln-author-asset', 'kiln-refine-asset', 'kiln-qa-asset'];
const optional = { compose: 'kiln-compose-scene', batch: 'kiln-batch-dispatch' };
const inside = (parent, child) => {
  const rel = relative(parent, child);
  return !rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
};

export async function preflightRuntime(runtime, skills, probeDependencies = true) {
  assertNodeRuntime();
  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'));
    for (const file of [
      'dist/cli.mjs',
      'dist/mcp-server.mjs',
      'dist/evaluator-worker.mjs',
      'dist/build.json',
      ...skills.map((name) => `skills/${name}/SKILL.md`),
    ]) {
      if (!(await stat(join(runtime, file))).isFile()) throw new Error(file);
    }
    const build = JSON.parse(await readFile(join(runtime, 'dist/build.json'), 'utf8'));
    for (const [name, file] of [
      ['cli', 'cli.mjs'],
      ['mcp', 'mcp-server.mjs'],
      ['worker', 'evaluator-worker.mjs'],
    ]) {
      const entry = build.entries?.[name];
      if (
        build.schemaVersion !== 1 ||
        entry?.identity !== build.entries.cli?.identity ||
        entry?.bundleHash !== `sha256:${hash(await readFile(join(runtime, 'dist', file)))}`
      )
        throw new Error(`Inconsistent ${name} build`);
    }
  } catch (error) {
    throw new Error(
      `Kiln installation is incomplete or inconsistent at ${runtime}. Install dependencies and run bun run build:runtime before setup.`,
      { cause: error },
    );
  }
  if (!probeDependencies) return pkg;
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'const m = await import(process.argv[1]); if (typeof m.main !== "function") throw new Error("Missing CLI entry");',
      pathToFileURL(join(runtime, 'dist/cli.mjs')).href,
    ],
    { cwd: runtime, encoding: 'utf8', timeout: 30000, windowsHide: true },
  );
  if (probe.status !== 0)
    throw new Error(
      `Kiln runtime dependencies could not load. Reinstall dependencies at ${runtime}. ${probe.error?.message ?? probe.stderr.trim()}`,
    );
  return pkg;
}

function managedFiles(root, runtime, harness, nodeExecutable) {
  const store = join(root, '.kiln', 'programs');
  const server = join(runtime, 'dist', 'mcp-server.mjs');
  const mcp = {
    command: nodeExecutable,
    args: [server],
    env: { KILN_PROGRAM_STORE: store, KILN_RENDER: 'auto', KILN_WORKSPACE: root },
  };
  const files = {
    // The MCP server runs the pinned Node. Another Node version can change float digits
    // in exported GLB JSON, so the CLI re-executes under the same interpreter.
    'kiln.mjs': [
      '// Generated runtime launcher. Repair paths with kiln-init <workspace> --repair.',
      "import { spawnSync } from 'node:child_process';",
      "import { existsSync, realpathSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      '// Run under the Node the MCP server uses, so both surfaces export identical bytes.',
      `const pinned = ${quote(nodeExecutable)};`,
      "const canonical = (path) => (process.platform === 'win32' ? realpathSync(path).toLowerCase() : realpathSync(path));",
      'if (!process.env.KILN_PINNED_NODE && existsSync(pinned) && canonical(process.execPath) !== canonical(pinned)) {',
      "  const child = spawnSync(pinned, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, KILN_PINNED_NODE: '1' } });",
      "  if (child.error) console.error('Could not start the workspace Node ' + pinned + ': ' + child.error.message + '. Run kiln-init <workspace> --repair.');",
      '  process.exit(child.status ?? 1);',
      '}',
      'delete process.env.KILN_PINNED_NODE;',
      'process.env.KILN_WORKSPACE = dirname(fileURLToPath(import.meta.url));',
      "process.env.KILN_PROGRAM_STORE = join(process.env.KILN_WORKSPACE, '.kiln', 'programs');",
      'try {',
      `  const { assertWorkspaceCurrent } = await import(${quote(pathToFileURL(join(runtime, 'scripts/create-workspace.mjs')).href)});`,
      `  await assertWorkspaceCurrent(dirname(fileURLToPath(import.meta.url)), ${quote(runtime)});`,
      `  const { main } = await import(${quote(pathToFileURL(join(runtime, 'dist/cli.mjs')).href)});`,
      '  process.exitCode = await main(process.argv.slice(2));',
      '} catch (error) {',
      "  console.error(error.message + '\\nIf the installation moved, run kiln-init <workspace> --repair from the current Kiln installation.');",
      '  process.exitCode = 1;',
      '}',
      '',
    ].join('\n'),
  };
  if (harness === 'claude') files['.mcp.json'] = quote({ mcpServers: { kiln_workspace: mcp } });
  if (harness === 'codex') {
    const rendererEnvironment = [
      'KILN_RENDER_TOKEN',
      'RENDER_SERVICE_TOKEN',
      'KILN_RENDER_PORT_URL',
      'KILN_RENDER_SERVICE_PORT',
      'KILN_WORK_ITEM',
    ];
    // Codex has NO project-local configuration. Every source it reads is
    // $CODEX_HOME-rooted: `-c` overrides ~/.codex/config.toml, `-p <name>` layers
    // $CODEX_HOME/<name>.config.toml, and `-C`/`--cd` changes only the working
    // directory. So this file is documentation of intent, not configuration --
    // codex will never read it, and the launcher below is what registers the
    // server. It stays because a reader looking for the workspace's MCP wiring
    // looks here first, and finding nothing is worse than finding a pointer.
    files['.codex/config.toml'] =
      `# Codex does not read a project-local config. This file records what the\n# workspace registers; \`node codex.mjs\` is what actually applies it, passing\n# these values as -c overrides per invocation.\n[mcp_servers.kiln_workspace]\ncommand = ${quote(mcp.command)}\nargs = [${quote(server)}]\nenv_vars = ${quote(rendererEnvironment)}\n[mcp_servers.kiln_workspace.env]\nKILN_PROGRAM_STORE = ${quote(store)}\nKILN_RENDER = "auto"\nKILN_WORKSPACE = ${quote(root)}\n`;
    // Per-invocation `-c` overrides are the whole fix. They add the server to
    // this one run and write nothing anywhere: $CODEX_HOME keeps its own config
    // and, critically, its authentication. That is the rule a workspace has to
    // respect for any harness whose configuration is user-global -- it may add
    // configuration to an invocation, but it must not relocate the home that
    // holds credentials. Redirecting the home is what broke hermes.
    //
    // `--cd` sets the project directory; a workspace is deliberately not a git
    // checkout, so `--skip-git-repo-check` is required rather than optional.
    files['codex.mjs'] = `import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const overrides = [
  ['mcp_servers.kiln_workspace.command', ${quote(mcp.command)}],
  ['mcp_servers.kiln_workspace.args', [${quote(server)}]],
  ['mcp_servers.kiln_workspace.env_vars', ${quote(rendererEnvironment)}],
  ['mcp_servers.kiln_workspace.env.KILN_PROGRAM_STORE', ${quote(store)}],
  ['mcp_servers.kiln_workspace.env.KILN_RENDER', 'auto'],
  ['mcp_servers.kiln_workspace.env.KILN_WORKSPACE', root],
].flatMap(([key, value]) => ['-c', key + '=' + JSON.stringify(value)]);
const isFile = path => {
  try { return statSync(path).isFile(); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
};
function executable() {
  if (process.platform !== 'win32') return { command: 'codex', prefix: [] };
  for (const value of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const directory = resolve(value.replace(/^"(.*)"$/, '$1'));
    const native = join(directory, 'codex.exe');
    if (isFile(native)) return { command: native, prefix: [] };
    if (!isFile(join(directory, 'codex.cmd'))) continue;
    // Node cannot spawn a Windows batch shim without a shell. Run npm's JS entry directly.
    const entry = join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (isFile(entry)) return { command: process.execPath, prefix: [entry] };
    throw new Error('Cannot resolve the npm Codex entry beside ' + directory + '. Reinstall the Codex CLI or put a native codex.exe on PATH.');
  }
  throw new Error('Codex CLI was not found on PATH. Install Codex before running this launcher.');
}
const args = process.argv.slice(2);
if (args[0] === 'exec') args.shift();
const resume = args[0] === 'resume';
if (resume) args.shift();
// --cd belongs to exec; resume must receive its own config and non-git workspace flag.
const invocation = ['exec', '--cd', root, ...(resume ? ['resume'] : []), ...overrides, '--skip-git-repo-check', ...args];
try {
  const { command, prefix } = executable();
  const child = spawn(command, [...prefix, ...invocation], { cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
`;
  }
  if (harness === 'agy') {
    files['.agents/mcp_config.json'] = quote({ mcpServers: { kiln_workspace: mcp } });
    files['agy.mjs'] =
      `import { spawn } from 'node:child_process';\nimport { dirname } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst root = dirname(fileURLToPath(import.meta.url));\nconst args = process.argv.slice(2);\nconst has = names => args.some(arg => names.some(name => arg === name || arg.startsWith(name + '=')));\nif (!has(['--project', '--new-project', '--conversation', '--continue', '-c'])) args.unshift('--new-project');\nargs.unshift('--add-dir', root);\nif (has(['--print', '--prompt', '-p']) && !has(['--disable-slash-commands'])) args.unshift('--disable-slash-commands');\nconst child = spawn('agy', args, { cwd: root, stdio: 'inherit', windowsHide: true });\nchild.on('error', error => { console.error(error.message); process.exitCode = 1; });\nchild.on('exit', code => { process.exitCode = code ?? 1; });\n`;
  }
  // Copilot reads a workspace `.mcp.json`, the same filename as Claude Code, and
  // not the same contents: `copilot mcp add` writes `type: "local"` plus an
  // explicit tool filter where Claude writes `type: "stdio"` and no filter. The
  // spelling here is the one Copilot's own CLI produced, rather than Claude's
  // adapted by hand, because an unreadable server does not report itself -- it
  // just answers as though the tools were never mentioned.
  //
  // Its skills need no new directory: `copilot skill --help` lists
  // `.github/skills/`, `.agents/skills/` and `.claude/skills/` as project
  // sources, and the registration copies below already write the last two.
  if (harness === 'copilot')
    files['.mcp.json'] = quote({
      mcpServers: { kiln_workspace: { tools: ['*'], type: 'local', ...mcp } },
    });
  // Cursor's CLI reads `.cursor/mcp.json` here or `~/.cursor/mcp.json` globally,
  // and the user-level file is the hazard: an entry named `kiln` there can point
  // at a different installation. One did -- an extracted 0.6.0 package while the
  // checkout was 0.7.0. A workspace-local config under its own name is what keeps
  // a trial pinned to the engine it is supposed to be testing.
  //
  // Its skills need no new directory either: Cursor's project skill paths are
  // `.agents/skills/` and `.cursor/skills/`, with `.claude/skills/` supported as
  // legacy, so the registration copies below already land in one it reads. The
  // CLI also applies a project-root AGENTS.md as a rule.
  if (harness === 'cursor-agent')
    files['.cursor/mcp.json'] = quote({ mcpServers: { kiln_workspace: mcp } });
  if (harness === 'opencode')
    files['opencode.json'] = quote({
      $schema: 'https://opencode.ai/config.json',
      skills: { paths: [join(root, 'skills')] },
      mcp: {
        kiln_workspace: {
          type: 'local',
          command: [mcp.command, server],
          environment: mcp.env,
          enabled: true,
        },
      },
    });
  if (harness === 'hermes') {
    // Hermes, like codex, has no project-local configuration: everything is
    // $HERMES_HOME-rooted and `hermes mcp add` has no scope flag. This file used
    // to be made real by pointing HERMES_HOME at it -- which worked for MCP
    // servers and skills, and silently took the provider selection and the
    // credential store with it. A workspace configured that way could not reach a
    // model at all: `model.default` and `model.provider` came back unset and the
    // run died before its first call. So this is documentation of intent now, and
    // the launcher applies what it can through documented flags.
    files['.hermes/config.yaml'] = quote({
      note: 'Hermes reads no project-local config. This file records what the workspace wants; node hermes.mjs applies the skills path and program store per invocation. Registering the MCP server is user-level; START.md has the one command.',
      mcp_servers: { kiln_workspace: mcp },
      skills: { external_dirs: [join(root, '.agents', 'skills')] },
    });
    // No HERMES_HOME redirect. `--in` sets the project directory, which is what
    // makes hermes inject this workspace's AGENTS.md as a rule -- so the guide
    // reaches the agent without any skill registration. `--skills` is NOT used:
    // it takes skill NAMES resolved against configured sources, not a path, and
    // handing it a directory fails with "Unknown skill(s)".
    //
    // The program store needs no configuration file at all: the MCP server reads
    // KILN_PROGRAM_STORE from its environment, and a server hermes spawns
    // inherits this one -- so a user-level registration gets retargeted at this
    // workspace's store without anything being written outside it.
    files['hermes.mjs'] =
      `import { spawn } from 'node:child_process';\nimport { dirname, join } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst root = dirname(fileURLToPath(import.meta.url));\nconst args = process.argv.slice(2);\nconst has = names => args.some(arg => names.some(name => arg === name || arg.startsWith(name + '=')));\nif (!has(['--in'])) args.unshift('--in', root);\nconst child = spawn('hermes', args, { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, KILN_PROGRAM_STORE: join(root, '.kiln', 'programs'), KILN_RENDER: 'auto', KILN_WORKSPACE: root, TERMINAL_CWD: root } });\nchild.on('error', (error) => { console.error(error.message); process.exitCode = 1; });\nchild.on('exit', (code) => { process.exitCode = code ?? 1; });\n`;
  }
  return { files, store, server };
}

function startGuide(root, runtime, harness, nodeExecutable, server) {
  const launchers = { agy: 'node agy.mjs', codex: 'node codex.mjs', hermes: 'node hermes.mjs' };
  const command = launchers[harness] ?? harness;
  const launch =
    harness === 'hermes'
      ? `Hermes keeps configuration in $HERMES_HOME and has no project-local equivalent, so the launcher supplies this workspace's directory, skills and program store per invocation and leaves your provider and credentials exactly as they are. Registering the server itself is the one user-level step; run it once:\n\n\`\`\`bash\nhermes mcp add kiln_workspace --command ${nodeExecutable} --env KILN_RENDER=auto --args ${server}\n\`\`\`\n\nVerify with \`hermes mcp list\`. The launcher retargets the program store at this workspace through the environment, so one registration serves every workspace. Skills reach the agent through this directory's AGENTS.md and \`skills/\`; to have hermes register them as skills too, add \`skills.external_dirs\` pointing at ${join(root, '.agents', 'skills')} to your own config once. Pass \`--ignore-rules\` only when you want to suppress AGENTS.md along with your user-level rules.`
      : harness === 'agy'
        ? 'The launcher supplies the absolute project directory. For headless runs, use node agy.mjs --model MODEL --print="Read AGENTS.md and the project skills. Use only kiln_workspace MCP tools. YOUR TASK.". The attached `--print=TEXT` spelling is required; a separated value is parsed incorrectly. Print mode disables automatic slash-command/skill expansion to avoid automatic expansion of a global skill. Use absolute task-file paths in headless prompts and verify that tool calls use kiln_workspace; global configuration and authentication remain unchanged.'
        : harness === 'codex'
          ? 'Codex keeps configuration in $CODEX_HOME and has no project-local equivalent, so `node codex.mjs` passes this workspace\'s server, program store and directory as per-invocation `-c` overrides. It writes nothing outside this directory and leaves your $CODEX_HOME and its authentication untouched. Running bare `codex` here reaches no Kiln tools. For headless runs, add the prompt: node codex.mjs "Read AGENTS.md and the project skills, then YOUR TASK.".'
          : `This directory is configured for ${harness}.`;
  return `# Start making assets\n\n\`\`\`bash\ncd ${root}\n${command}\n\`\`\`\n\n${launch} Accept the project/MCP trust prompts. Ask the agent to read AGENTS.md and create an asset. Kiln needs no separate model key.\n\nCore author/refine/QA skills are installed and registered for this harness. Optional compose/batch skills are selected at setup with --skills compose,batch.\n\nThese are shared CLI/MCP skills for your chosen harness. The optional built-in Strands agent adds its workflow internally; do not copy its prompt or native workflow into this workspace.\n\nLong-running and headless sessions may compact context automatically. AGENTS.md describes the harness-neutral KILN_PROGRESS.md handoff that preserves the current programRef and next action across compaction. Harness-specific thresholds are documented in Kiln's docs/harnesses.md; leave native automatic compaction enabled when the active model's context size is unknown.\n\nKeep assets here and engine source outside. This separates task context, not operating-system permissions. User instructions and authentication can still apply.\n\nRun repair after anything that invalidates the generated absolute paths: moving this workspace, moving or reinstalling the runtime, or removing the Node executable that setup recorded. The manifest pins the exact interpreter the preflight check validated. Invoking the CLI with another supported Node does not require repair while the recorded executable remains available.\n\n\`\`\`bash\nnode ${join(runtime, 'scripts/create-workspace.mjs')} ${root} --repair\n\`\`\`\n\nThat path is where the installation was at setup. If the installation itself moved, run the same command from its current location; \`runtime\` in .kiln/workspace.json records where this workspace last expected it.\n\nRepair updates generated runtime paths only and refuses edited configuration. For a runtime or skill update, stop the harness/MCP session, run kiln-init on this directory with --check and then --upgrade, and restart the session. Upgrade refreshes unchanged managed configuration, instructions and all skill copies; conflicting edits stop it before writing. Preserve and resolve the named files explicitly. Assets and saved revisions remain in place.\n`;
}

const guide = `# Kiln asset workspace

Author and refine assets in this directory. The engine is installed separately. Do not read its implementation or example collection to solve an asset task.

Two surfaces drive the same engine and share .kiln/programs, so either is fine and you can mix them freely. The kiln_workspace MCP server returns each render as an image in your context. The node kiln.mjs CLI writes renders to disk, so read the PNG back before judging anything visual. A server named kiln may be a different installation; do not substitute it silently, and report the setup problem instead. To check, call kiln_discover with { capabilities: true } and compare capabilities.engine.installUrl against runtime in .kiln/workspace.json.

If the shell cannot resolve node, read manifest.node (the node field in .kiln/workspace.json) and substitute that quoted absolute executable. In PowerShell: & "ABSOLUTE_NODE_PATH" kiln.mjs discover --json. Use the same substitution for a generated harness launcher such as codex.mjs; no global PATH change is needed. kiln.mjs itself always runs the CLI under that recorded Node, the one the MCP server uses, so a CLI export and kiln_save of one programRef are byte-identical.

Read the skill for your task from skills/ in this directory, never a global plugin copy. The maintained copies are there, mirrored into .claude/skills/ and .agents/skills/ because harnesses scan different directories. Use kiln_discover with no arguments for a compact overview and starting createRoot/createPart signatures. Search in ordinary modeling language with { query: "curved hollow tube" }; fetch complete contracts with { ids: ["sweepProfile"] }. Search and overview return six summaries by default, with current family/kind/tags filters and offset/limit pagination. Exact ids accepts up to six distinct IDs or executable names. Recipes are optional guidance, and no asset-category selection or separate search model is required. CLI equivalents are node kiln.mjs discover --query "curved hollow tube" and node kiln.mjs discover --id sweepProfile --json.

Managed CLI/MCP startup checks runtime and copied-skill versions. If they differ, stop this session and run kiln-init on this directory with --check and --upgrade from the desired installation. Conflicting local edits require an explicit merge; do not overwrite them to clear a diagnostic. Restart the session after upgrading.

## Standalone assets and optional projects

This workspace supports standalone assets, experiments, scenes and projects. A project is optional: it stores a shared brief, inventory, design profile and material lock for related work. Do not create one just to build, review, save or export an asset. The save collection named project is a destination and does not imply project membership.

Omitted project selection stays standalone even when projects exist, unless KILN_PROJECT was explicitly configured. CLI --no-project or MCP projectId: null overrides that default. For a pack or other related work, create a project with node kiln.mjs project create --id my-pack --name "My pack", or kiln_project with {action:"create", draft:{projectId:"my-pack", name:"My pack"}}. Read the returned revision, then use project update --expected or MCP expectedRevision to update the brief, design, inventory and materialDependencies. Every supplied top-level field replaces its previous value, including the whole design object: read and merge preferences before updating. Creating or opening a project does not select it for subsequent authoring calls.

Select a project per operation with --project / projectId and optionally --project-revision / projectRevision for an exact configuration. Library materials also work standalone through call-level materialDependencies or CLI --materials pins.json; pin returned immutable revisions before compiling a portableSpec. Read skills/kiln-author-asset/references/projects-and-materials.md when using these facilities. Project preferences do not establish trusted QA requirements. Check connected schemas before assuming optional host services.

Run node kiln.mjs view to open the shared Library, Materials, Projects and Live Review dashboard. Live Review observes standalone and project work, including exact retained artifacts and render fidelity. kiln_review save uses the displayed expectedRevision to save the reviewed artifact without re-evaluation. Pinning retains evidence but does not pause the agent, and feedback remains in the agent conversation. Use individual asset delivery for standalone work and project export for saved inventory packs; editable delivery carries source/resources, while runtime delivery supplies GLB/metadata.

## The loop

1. Draft. Pass code once to kiln_render or kiln_validate, or import a file with node kiln.mjs source asset.kiln.js. Either returns a programRef, normally a short immutable p_ handle. Keep it even when validation fails. Copy it exactly; never construct, expand or shorten one, and do not retransmit the program.
2. Render. kiln_render, or node kiln.mjs render PROGRAM_REF --views sheet.png.
3. Review. Look at the image. Check viewFidelity before judging materials: a CPU view is honest about silhouette, proportion and contact, and says nothing about colour, metalness or roughness.
   For animation, use kiln_screenshot_animation or node kiln.mjs animation PROGRAM_REF --clip CLIP_NAME --phases 0,0.25,0.5,0.75,1 --views motion.png --json. Phases are fractions of clip duration. Add --render gpu for material review, read the PNG and check attachments in intermediate poses; do not replace clip sampling with source edits that bake a rest pose.
4. Edit. Read exact anchors with kiln_source and a literal query, following nextOffset for more context, then call kiln_edit with programRef and edits. Each edit returns a new programRef; use that one from then on. Rewriting the whole file through the CLI works, but it loses the anchored diff and the revision lineage.
5. Save. The user chooses a named destination; discover configured collections when needed and otherwise default to project. Use kiln_save, or node kiln.mjs save. Keep the exact asset and revision IDs. Save refinements as child revisions rather than replacing their parent. When the user wants to see the result, call kiln_present; if the host cannot render it, launch node kiln.mjs view yourself and provide its loopback URL.

Export at any point. Source is node kiln.mjs source PROGRAM_REF --out revised.kiln.js; geometry is node kiln.mjs render PROGRAM_REF --out asset.glb --views sheet.png. Source and ZIP exports refuse to overwrite a file. Render replaces existing GLB and PNG files only after each replacement is fully written and closed; a failed write or rename preserves the previous file. Replacement is per file, not a transaction across outputs. Replace PROGRAM_REF with the exact returned reference; full sha256 references also remain valid.

## Material-faithful views

This workspace asks for render mode auto. Textured or metallic scenes use a verified compatible GPU service, starting one lazily when local dependencies are available. Ordinary untextured scenes with zero metalness and no advanced material extensions use CPU geometry views; this does not indicate renderer failure. CPU views report viewFidelity.materialFaithful false and cannot confirm PBR appearance. Use CLI --render gpu when GPU material review is required, including roughness on nonmetallic surfaces.

The render-service code is included with Kiln, with its native GPU dependency optional at the Kiln package root. Check node kiln.mjs service status first. If dependencies are missing or incompatible, reinstall the official Kiln package with optional dependencies enabled; read runtime from .kiln/workspace.json to identify the installation. A source checkout uses bun install --frozen-lockfile at that root. CLI and MCP start the managed service when needed; compatible clients share it until five minutes pass without admitted work. From the installation root, node --import ./render-service/src/register-hooks.mjs render-service/src/server.mjs starts a manual service that remains running while idle. Unknown or incompatible listeners are reported and left in place.

After dependency repair or a cached startup failure, call kiln_renderer with {action:"reprobe"} in this MCP session. It refreshes the existing route without installing dependencies or starting a renderer; the next view starts one if needed. CLI service reprobe checks only its own process. Restart the session after changing Kiln, environment variables or credentials.

For a renderer on another device, configure this MCP server process with KILN_RENDER_PORT_URL and, when required, KILN_RENDER_TOKEN through the harness's environment settings. CLI commands accept --render-port URL and read KILN_RENDER_TOKEN. Run a compatible Kiln renderer on that device; a bind beyond loopback requires service-side RENDER_SERVICE_TOKEN unless an authenticated proxy is explicitly configured. A remote service is managed on its own device. Check capabilities for the selected route and an actual viewFidelity receipt for successful material rendering.

For a task about appearance, say so rather than silently accepting CPU views.

## Context compaction

Long-running and headless sessions may compact context automatically. Keep a small KILN_PROGRESS.md when the task spans many tool calls. Before a compaction boundary, or after each meaningful revision, record the active goal, current programRef, files changed, validation and render results, unresolved errors, and the exact next action. After compaction, read that note and continue; do not stop merely because the conversation was summarized. Never replace a programRef from memory -- copy the exact current value from the note or the latest tool result.

## Keep this context clean

Skills and MCP servers from user-level configuration still load here: a workspace separates task context, not operating-system permissions. When you verify the server, report anything registered that is unrelated to this task so the user can decide whether to narrow it.

Keep .kiln/programs while working. Source files are portable; references resolve only in a store containing their source.
`;

async function readManifest(root) {
  try {
    return JSON.parse((await workspaceFile(root, '.kiln/workspace.json')).toString('utf8'));
  } catch {
    throw new Error('This is not a managed Kiln workspace. Existing files were not changed.');
  }
}

async function fileHashes(directory, prefix = '') {
  const hashes = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      Object.assign(hashes, await fileHashes(join(directory, entry.name), name));
    else if (entry.isFile()) hashes[name] = hash(await readFile(join(directory, entry.name)));
  }
  return hashes;
}

async function workspaceFile(root, name) {
  let path = root;
  for (const segment of name.split('/')) {
    path = join(path, segment);
    try {
      if ((await lstat(path)).isSymbolicLink())
        throw new Error(`Refusing symbolic link in managed path: ${name}`);
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  }
  return readFile(path);
}

function safeManagedName(name, skills, generatedNames) {
  const segments = name.split('/');
  const prefix = ['skills/', '.agents/skills/', '.claude/skills/'].find((p) => name.startsWith(p));
  if (
    name.includes('\\') ||
    name.includes(':') ||
    segments.some((s) => !s || s === '.' || s === '..') ||
    !(
      generatedNames.has(name) ||
      ['AGENTS.md', 'CLAUDE.md', 'START.md'].includes(name) ||
      (prefix && skills.includes(name.slice(prefix.length).split('/')[0]))
    )
  )
    throw new Error(`Unsafe managed path: ${name}`);
}

async function managedHashes(root, manifest, files) {
  const hashes = Object.fromEntries(
    Object.entries(files).map(([name, body]) => [name, hash(body)]),
  );
  for (const name of ['AGENTS.md', 'CLAUDE.md', 'START.md'])
    hashes[name] = hash(await readFile(join(root, name)));
  for (const folder of ['skills', ...skillRegistries])
    for (const [name, digest] of Object.entries(manifest.skillHashes))
      hashes[`${folder}/${name}`] = digest;
  return hashes;
}

/** Explicit update: compare original, local and current bytes before writing any file. */
async function upgradeWorkspace(root, runtime, previous, manifest, files, check) {
  if (previous.schemaVersion !== 1) throw new Error('Unsupported workspace manifest version.');
  const desired = {
    ...files,
    'AGENTS.md': guide,
    'CLAUDE.md': guide,
    'START.md': startGuide(
      root,
      runtime,
      manifest.harness,
      manifest.node,
      join(runtime, 'dist/mcp-server.mjs'),
    ),
  };
  const skillHashes = {};
  for (const skill of manifest.skills) {
    for (const [name, digest] of Object.entries(await fileHashes(join(runtime, 'skills', skill)))) {
      const relativeName = `${skill}/${name}`;
      skillHashes[relativeName] = digest;
      const body = await readFile(join(runtime, 'skills', relativeName));
      for (const folder of ['skills', ...skillRegistries])
        desired[`${folder}/${relativeName}`] = body;
    }
  }
  const knownNames = new Set(
    harnesses.flatMap((h) => Object.keys(managedFiles(root, runtime, h, manifest.node).files)),
  );
  const originalHashes = { ...previous.generated };
  for (const folder of ['skills', ...skillRegistries])
    for (const [name, digest] of Object.entries(previous.skillHashes ?? {})) {
      safeManagedName(`${folder}/${name}`, manifest.skills, knownNames);
      originalHashes[`${folder}/${name}`] = digest;
    }
  Object.assign(originalHashes, previous.managedHashes);
  const entries = [],
    originals = new Map();
  for (const name of new Set([...Object.keys(originalHashes), ...Object.keys(desired)])) {
    safeManagedName(name, manifest.skills, knownNames);
    const body = await workspaceFile(root, name);
    originals.set(name, body);
    const local = body === undefined ? undefined : hash(body);
    const current = desired[name] === undefined ? undefined : hash(desired[name]);
    const original = originalHashes[name];
    const status =
      local === current
        ? 'current'
        : local === undefined
          ? 'missing'
          : local === original
            ? current === undefined
              ? 'retired'
              : 'outdated'
            : original === current && current !== undefined
              ? 'customized'
              : 'conflict';
    entries.push({ path: name, status });
  }
  const runtimeChanged =
    previous.runtime !== runtime ||
    previous.node !== manifest.node ||
    previous.runtimeVersion !== manifest.runtimeVersion ||
    previous.runtimeIdentity !== manifest.runtimeIdentity ||
    JSON.stringify(previous.runtimeHashes) !== JSON.stringify(manifest.runtimeHashes);
  const changes = entries.filter((e) => !['current', 'customized'].includes(e.status));
  const conflicts = entries.filter((e) => e.status === 'conflict');
  const report = {
    root,
    runtime,
    status: runtimeChanged || changes.length ? 'update-required' : 'current',
    runtimeChanged,
    files: entries.filter((e) => e.status !== 'current'),
    next: `Stop the workspace's harness/MCP session. Run kiln-init ${quote(root)} --upgrade from the desired installation, then restart the session.`,
  };
  if (check) return report;
  if (conflicts.length)
    throw new Error(
      `Workspace upgrade has conflicts; no files were changed: ${conflicts.map((e) => e.path).join(', ')}. ` +
        'Preserve these customized or untracked files, compare with the current installation, and move them aside or replace them with the current versions before retrying. Reapply compatible customizations after upgrading.',
    );
  const oldManifest = await workspaceFile(root, '.kiln/workspace.json');
  // Recheck snapshots before mutation, including directories that could have become links.
  for (const [name, original] of originals) {
    const current = await workspaceFile(root, name);
    if (
      (current === undefined) !== (original === undefined) ||
      (current && original && !current.equals(original))
    )
      throw new Error(`Workspace changed during upgrade: ${name}`);
  }
  if (!(await workspaceFile(root, '.kiln/workspace.json'))?.equals(oldManifest))
    throw new Error('Workspace manifest changed during upgrade.');
  const touched = [];
  try {
    for (const { path: name } of changes) {
      touched.push(name);
      if (desired[name] === undefined) await rm(join(root, name), { force: true });
      else {
        await mkdir(dirname(join(root, name)), { recursive: true });
        await writeFile(join(root, name), desired[name]);
      }
    }
    manifest.skillHashes = skillHashes;
    manifest.managedHashes = Object.fromEntries(
      Object.entries(desired).map(([name, body]) => [name, hash(body)]),
    );
    await writeFile(join(root, '.kiln/workspace.json'), quote(manifest));
  } catch (error) {
    for (const name of touched.reverse()) {
      const original = originals.get(name);
      if (original === undefined) await rm(join(root, name), { force: true });
      else await writeFile(join(root, name), original);
    }
    await writeFile(join(root, '.kiln/workspace.json'), oldManifest);
    throw error;
  }
  return {
    ...report,
    status: 'current',
    upgraded: true,
    changed: changes.map((e) => e.path),
    next: 'Restart the harness/MCP session to refresh cached tools and instructions.',
  };
}

/** Called by generated CLI launchers and opted-in MCP workspaces before serving tools. */
export async function assertWorkspaceCurrent(root, runtime = installation) {
  const report = await createWorkspace(root, 'claude', { installation: runtime, check: true });
  if (report.status !== 'current')
    throw new Error(
      `Kiln workspace is out of date${report.runtimeChanged ? ' (runtime changed)' : ''}: ` +
        `${report.files
          .filter((e) => e.status !== 'customized')
          .map((e) => e.path)
          .join(', ')}. ` +
        `Run kiln-init ${quote(root)} --check and --upgrade from ${runtime}; restart the harness/MCP session afterward.`,
    );
}

/** Resolve hoisted or nested packages without loading native code or claiming GPU readiness. */
export async function renderServiceNotice(runtime) {
  const dir = join(runtime, 'render-service');
  if (!existsSync(join(dir, 'src/server.mjs')) || !existsSync(join(dir, 'package.json')))
    return undefined;
  try {
    const { resolvedRendererDependencies } = await import(
      '../render-service/src/build-identity.mjs'
    );
    resolvedRendererDependencies(pathToFileURL(join(dir, 'src/server.mjs')).href);
    return undefined;
  } catch (error) {
    return `The local GPU renderer at ${dir} is unavailable: ${error.message}. Reinstall the official Kiln package at ${runtime} with optional dependencies enabled. CPU views remain available for geometry; they cannot confirm materials. A separately configured compatible renderer can provide material views.`;
  }
}

/** Preflight first; create a complete project in a staging directory before installing it. */
export async function createWorkspace(directory, harness = 'claude', options = {}) {
  let root = resolve(directory);
  const runtime = await realpath(resolve(options.installation ?? installation));
  if ([options.repair, options.upgrade, options.check].filter(Boolean).length > 1)
    throw new Error('Choose only one of --repair, --upgrade or --check.');
  if ((options.repair || options.upgrade || options.check) && options.skills)
    throw new Error('Maintenance does not change the installed skill selection.');
  const previous =
    options.repair || options.upgrade || options.check ? await readManifest(root) : undefined;
  // A read-only check validates the configured interpreter, not whichever supported
  // Node the caller's shell selected. Setup/repair/upgrade deliberately repin it.
  // A missing recorded executable remains drift; do not silently accept that case.
  // Resolve new pins through version-manager links that may last only one shell.
  const nodeExecutable =
    options.check && typeof previous?.node === 'string' && existsSync(previous.node)
      ? previous.node
      : realpathSync(process.execPath);
  if (previous) harness = previous.harness;
  if (!harnesses.includes(harness)) throw new Error(`Choose ${harnesses.join(', ')}.`);
  const extras = options.skills ?? [];
  if (extras.some((name) => !Object.hasOwn(optional, name)))
    throw new Error('Optional skills: compose,batch.');
  const skills = previous?.skills ?? [...core, ...new Set(extras.map((name) => optional[name]))];
  if (
    !Array.isArray(skills) ||
    skills.some((name) => ![...core, ...Object.values(optional)].includes(name))
  )
    throw new Error('Invalid workspace skill manifest.');
  const pkg = await preflightRuntime(runtime, skills, !options.check);
  let exists = false;
  try {
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Choose a real directory, not a symbolic link.');
    exists = true;
    root = await realpath(root);
    if (inside(runtime, root)) throw new Error('Choose a directory outside the Kiln installation.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Resolve the nearest existing parent so symlinks cannot bypass the installation check.
  let ancestor = dirname(root);
  while (true) {
    try {
      const canonical = await realpath(ancestor);
      // Node resolves entry files through aliases (e.g. /var -> /private/var on
      // macOS). Generate and later compare the same canonical workspace paths,
      // including destinations whose final directories do not exist yet.
      root = resolve(canonical, relative(ancestor, root));
      ancestor = canonical;
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
  if (inside(runtime, root) || inside(runtime, ancestor))
    throw new Error('Choose a directory outside the Kiln installation.');
  if (!previous && exists && (await readdir(root)).length)
    throw new Error('The destination must be empty; no existing files were changed.');
  const { files, store, server } = managedFiles(root, runtime, harness, nodeExecutable);
  const manifest = {
    schemaVersion: 1,
    harness,
    runtime,
    runtimeVersion: pkg.version,
    runtimeIdentity: JSON.parse(await readFile(join(runtime, 'dist/build.json'), 'utf8')).entries
      .cli.identity,
    runtimeHashes: {
      cli: hash(await readFile(join(runtime, 'dist/cli.mjs'))),
      mcp: hash(await readFile(join(runtime, 'dist/mcp-server.mjs'))),
      worker: hash(await readFile(join(runtime, 'dist/evaluator-worker.mjs'))),
    },
    node: nodeExecutable,
    skills,
    skillHashes: previous?.skillHashes,
    managedHashes: previous?.managedHashes
      ? {
          ...previous.managedHashes,
          ...Object.fromEntries(Object.entries(files).map(([name, body]) => [name, hash(body)])),
        }
      : undefined,
    generated: Object.fromEntries(Object.entries(files).map(([name, body]) => [name, hash(body)])),
  };
  if (previous && (options.upgrade || options.check))
    return upgradeWorkspace(root, runtime, previous, manifest, files, options.check);
  if (previous) {
    if (previous.schemaVersion !== 1) throw new Error('Unsupported workspace manifest version.');
    const originals = {};
    for (const name of Object.keys(files)) {
      if (!Object.hasOwn(previous.generated ?? {}, name)) {
        try {
          await lstat(join(root, name));
          throw new Error(`Refusing to replace existing ${name}.`);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        originals[name] = undefined;
        continue;
      }
      const original = await readFile(join(root, name), 'utf8');
      if (hash(original) !== previous.generated?.[name])
        throw new Error(
          `Refusing to replace edited ${name}. Preserve your changes and update its runtime paths manually.`,
        );
      originals[name] = original;
    }
    const oldManifest = await readFile(join(root, '.kiln/workspace.json'), 'utf8');
    try {
      for (const [name, body] of Object.entries(files)) await writeFile(join(root, name), body);
      await writeFile(join(root, '.kiln/workspace.json'), quote(manifest));
    } catch (error) {
      for (const [name, body] of Object.entries(originals)) {
        if (body === undefined) await rm(join(root, name), { force: true });
        else await writeFile(join(root, name), body);
      }
      await writeFile(join(root, '.kiln/workspace.json'), oldManifest);
      throw error;
    }
    return { root, harness, store, server, repaired: true };
  }
  await mkdir(dirname(root), { recursive: true });
  const stage = await mkdtemp(join(dirname(root), '.kiln-init-'));
  const installed = [];
  try {
    for (const [name, body] of Object.entries(files)) {
      await mkdir(dirname(join(stage, name)), { recursive: true });
      await writeFile(join(stage, name), body);
    }
    await mkdir(join(stage, '.kiln'), { recursive: true });
    await writeFile(join(stage, '.kiln/workspace.json'), quote(manifest));
    await writeFile(join(stage, '.gitignore'), '.kiln/programs/\n.hermes/\n*.glb\n*.png\n');
    for (const name of ['AGENTS.md', 'CLAUDE.md']) await writeFile(join(stage, name), guide);
    for (const name of skills)
      await cp(join(runtime, 'skills', name), join(stage, 'skills', name), { recursive: true });
    // Registration copies. No harness scans a bare `skills/`: Claude Code reads
    // only `.claude/skills/`, while codex, opencode, hermes, agy, copilot and
    // cursor-agent read `.agents/skills/`. Without these the workspace has skill files that the
    // agent can read only when told to, which is how it worked before. Copies
    // rather than symlinks because those need developer mode or an
    // administrator on Windows.
    for (const registry of skillRegistries)
      for (const name of skills)
        await cp(join(runtime, 'skills', name), join(stage, registry, name), { recursive: true });
    manifest.skillHashes = await fileHashes(join(stage, 'skills'));
    await writeFile(join(stage, '.kiln/workspace.json'), quote(manifest));
    // Harnesses whose configuration is user-global reach this workspace only
    // through their generated launcher. codex was missing from this map, so
    // START.md told the reader to run bare `codex` -- which reads no
    // project-local config at all, and is exactly the invocation that cannot see
    // the tools.
    await writeFile(
      join(stage, 'START.md'),
      startGuide(root, runtime, harness, nodeExecutable, server),
    );
    manifest.managedHashes = await managedHashes(stage, manifest, files);
    await writeFile(join(stage, '.kiln/workspace.json'), quote(manifest));
    if (exists) {
      // Windows cannot remove the caller's current directory, even when empty.
      // Move only staged entries and track them so a failed install rolls back.
      if ((await readdir(root)).length)
        throw new Error('The destination changed during setup; no files were replaced.');
      for (const name of await readdir(stage)) {
        const target = join(root, name);
        try {
          await lstat(target);
          throw new Error(`Refusing to replace ${target}.`);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        await rename(join(stage, name), target);
        installed.push(target);
      }
      await rm(stage, { recursive: true });
    } else await rename(stage, root);
  } catch (error) {
    for (const path of installed) await rm(path, { recursive: true, force: true });
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
  return { root, harness, store, server, skills };
}

function isDirectSetupEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectSetupEntry()) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
      console.log(
        'Usage: kiln-init <empty-directory> [--harness claude|codex|opencode|hermes|agy] [--skills compose,batch]\n       kiln-init <managed-workspace> --repair|--check|--upgrade',
      );
    } else {
      const directory = args.shift();
      if (!directory || directory.startsWith('--'))
        throw new Error('Provide a workspace directory. Run kiln-init --help for usage.');
      let harness = 'claude';
      const options = {};
      while (args.length) {
        const flag = args.shift();
        if (flag === '--repair') options.repair = true;
        else if (flag === '--upgrade') options.upgrade = true;
        else if (flag === '--check') options.check = true;
        else if (flag === '--harness' || flag === '--skills') {
          const value = args.shift();
          if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
          if (flag === '--harness') harness = value;
          else options.skills = value.split(',');
        } else throw new Error(`Unknown option: ${flag}`);
      }
      if (options.repair && options.skills)
        throw new Error('--repair does not change installed skills.');
      const result = await createWorkspace(directory, harness, options);
      console.log(quote(result));
      if (options.check && result.status !== 'current') process.exitCode = 1;
      const notice = await renderServiceNotice(await realpath(resolve(installation)));
      if (notice) console.error(notice);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
