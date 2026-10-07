#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceSetupCapabilities } from './create-workspace.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const executable = 'bin/kiln-setup-workspace.mjs';
const repositoryUrl = 'https://github.com/instruktlabs/kiln';
const listingLinks = {
  documentationUrl: `${repositoryUrl}/tree/main/plugins/kiln-engine`,
  supportUrl: `${repositoryUrl}/blob/main/plugins/kiln-engine/README.md#support-and-security`,
  privacyPolicyUrl: `${repositoryUrl}/blob/main/docs/local-plugin-privacy.md`,
  termsOfServiceUrl: `${repositoryUrl}/blob/main/LICENSE`,
};
const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:rc|dev)\.(0|[1-9]\d*))?$/;

async function inventory(directory, prefix = '') {
  const files = new Map();
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    if (entry.isSymbolicLink())
      throw new Error(`Plugin components must be real files: ${prefix}${entry.name}`);
    if (entry.isDirectory()) {
      for (const [name, bytes] of await inventory(
        join(directory, entry.name),
        `${prefix}${entry.name}/`,
      ))
        files.set(name, bytes);
    } else if (entry.isFile())
      files.set(`${prefix}${entry.name}`, await readFile(join(directory, entry.name)));
    else throw new Error(`Unsupported plugin component: ${prefix}${entry.name}`);
  }
  return files;
}

async function expectedFiles() {
  const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  if (pkg.name !== '@instruktlabs/kiln' || !exactVersion.test(pkg.version))
    throw new Error('The local plugin requires the exact Kiln release identity.');
  const release = JSON.parse(
    await readFile(join(repo, 'plugins/kiln-engine.release.json'), 'utf8'),
  );
  if (!exactVersion.test(release.version) || release.engineVersion !== pkg.version)
    throw new Error('The local plugin needs its own exact version and the current engine pin.');
  const identity = {
    name: 'kiln-engine',
    version: release.version,
    description:
      'Set up a local Kiln workspace to create, inspect and revise editable 3D assets with Claude Code or Codex.',
    author: { name: 'Instrukt Labs', email: 'support@instruktlabs.com' },
    homepage: repositoryUrl,
    repository: repositoryUrl,
    license: 'MIT',
    keywords: ['3d', 'glb', 'gltf', 'asset-generation', 'gamedev'],
  };
  const portable = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    ...identity,
    extensions: {
      'com.openai': {
        interface: {
          displayName: 'Kiln Engine',
          shortDescription: 'Create editable 3D assets in a local workspace',
          longDescription:
            'Install the pinned Kiln engine and set up a workspace with local MCP tools and maintained authoring skills. Your coding agent supplies the model.',
          developerName: 'Instrukt Labs',
          websiteURL: listingLinks.documentationUrl,
          supportURL: listingLinks.supportUrl,
          privacyPolicyURL: listingLinks.privacyPolicyUrl,
          termsOfServiceURL: listingLinks.termsOfServiceUrl,
          category: 'Developer Tools',
          capabilities: ['Read', 'Write'],
          defaultPrompt: [
            'Set up a Kiln workspace for this coding agent.',
            'Check my existing Kiln workspace without changing it.',
            'Upgrade my managed Kiln workspace while preserving my assets.',
          ],
        },
      },
    },
  };
  const files = new Map([
    ['plugin.json', json(portable)],
    [
      '.claude-plugin/plugin.json',
      json({ ...identity, icon: './.claude-plugin/icon.png', ...listingLinks }),
    ],
    ['.claude-plugin/icon.png', await readFile(join(repo, 'assets/branding/kiln-512.png'))],
    [
      'runtime.json',
      json({
        name: pkg.name,
        version: pkg.version,
        harnesses: workspaceSetupCapabilities.harnesses,
      }),
    ],
    ['LICENSE', await readFile(join(repo, 'LICENSE'))],
    ['PRIVACY.md', await readFile(join(repo, 'docs/local-plugin-privacy.md'))],
    [executable, await readFile(join(repo, 'scripts/setup-plugin-workspace.mjs'))],
  ]);
  for (const [name, bytes] of await inventory(
    join(repo, 'skills/kiln-setup-workspace'),
    'skills/kiln-setup-workspace/',
  ))
    files.set(name, bytes);
  const development = pkg.version.includes('-dev.')
    ? '**Development candidate.** This version is not published to npm. Qualification requires the reviewed local engine archive via `--archive`.\n\n'
    : pkg.version.includes('-rc.')
      ? '**Release candidate.** Use the reviewed archive via `--archive` for local qualification. Registry installation requires this exact version to be available on npm.\n\n'
      : '';
  files.set(
    'README.md',
    Buffer.from(
      `# Kiln Engine local plugin

${development}Plugin version ${release.version}, maintained by Instrukt Labs under the MIT license.
This plugin installs engine ${pkg.version}.

Set up Kiln in an existing project or a new asset workspace, then create and revise
editable 3D assets with your coding agent. Use a supported Node.js installation
with npm. No Bun, engine checkout, Kiln account or separate model API key is needed.
The plugin requires a local shell and filesystem; Claude chat and Cowork are not
supported by this local bundle.

## Install

For Claude Code:

\`\`\`sh
claude plugin marketplace add instruktlabs/kiln
claude plugin install kiln-engine@instruktlabs
\`\`\`

For Codex:

\`\`\`sh
codex plugin marketplace add instruktlabs/kiln
codex plugin add kiln-engine@instruktlabs
\`\`\`

Restart or reload your coding agent's plugins as its installation message directs.
Then ask it to set up a Kiln workspace. The maintained setup skill runs this
plugin's \`bin/kiln-setup-workspace.mjs\` with Node, installs
\`${pkg.name}@${pkg.version}\` outside the project and configures your chosen
workspace. The same initializer supports existing projects and new workspaces.

The plugin registers setup only. The workspace supplies authoring skills and one
local MCP server, \`kiln_workspace\`. Open Claude Code in that workspace or launch
Codex there with \`codex\`. For headless Codex execution, use
\`node codex.mjs "TASK"\` with an explicit prompt. Read \`.kiln/START.md\` after
adoption or \`START.md\` in a legacy workspace, accept the host's ordinary trust
prompts and verify live tool discovery before authoring.

## Setup examples

1. **Create:** “Set up a new Kiln workspace in an empty directory outside this
   checkout, using my current coding agent. Verify its tools before I author an
   asset.” The installer downloads the pinned engine when needed, creates the
   selected workspace and keeps its engine in a separate runtime store. npm also
   uses its normal cache and log directories.
2. **Adopt:** “Add Kiln to this project without replacing my instructions or other
   MCP settings. Show the planned changes first.” Use \`--adopt --check\` to
   preview, then \`--adopt\` to apply. Read \`.kiln/AGENTS.md\` alongside the
   project's instructions. Repeat with another supported \`--harness\` to add
   that integration around the same saved assets. The engine's adapter list is
   included in \`runtime.json\`; it does not imply this plugin can be installed
   in every listed client. Published engine 1.0.0 does not support adoption.
3. **Check:** “Check my existing Kiln workspace without changing it.” The helper's
   \`--check\` mode reports whether managed files and the installed engine are
   current. A missing runtime is reported without installing one.
4. **Upgrade:** “Upgrade my managed Kiln workspace while preserving my sources,
   saved assets and customizations.” Stop the workspace's harness session first.
   The helper's \`--upgrade\` mode uses the pinned engine and refuses conflicts
   rather than replacing customized managed files.

The engine installation and your assets stay outside the disposable plugin cache.
Removing or updating the plugin does not delete them. Existing workspaces stay on
their installed engine until an explicit managed upgrade. Read the
[setup and upgrade guide](skills/kiln-setup-workspace/references/plugin-install.md)
for paths, repair and failure recovery.

## Execution and network access

The setup skill asks your coding agent to execute a bundled Node installer. That
installer runs npm with lifecycle scripts disabled and invokes Kiln's workspace
generator. It does this before the workspace MCP server exists; it does not
silently install a global MCP server or grant itself shell permissions.

Adoption and managed project updates temporarily keep recovery copies outside
the project. Client configuration can already contain credentials, so these
private copies may too. They are removed after successful setup or recovery;
interrupted transactions retain them. See [local privacy](PRIVACY.md) for the
storage location and protection limits. Use \`--recover\` before retrying an
interrupted project update.

Marketplace installation and updates contact \`https://github.com\`. First engine
installation and dependency downloads use \`https://registry.npmjs.org\`. npm can
use your existing npm configuration and environment. No npm login or token is
required for this public package. Normal local asset work does not upload your
assets to Instrukt Labs. Tool results can enter your coding assistant's model
context; its provider handles those copies.

CPU rendering is local. Material appearance needs a compatible local renderer or
one you explicitly configure on another machine; a remote renderer receives the
GLB and requested capture settings. Follow the setup skill's renderer checks.
The separate hosted Kiln integration has its own authentication and privacy notice.

## Support and security

Send private security or privacy questions to
[support@instruktlabs.com](mailto:support@instruktlabs.com). Never include
passwords, tokens, recovery codes or private assets in public issues. For a normal
bug report, provide the plugin and engine versions, operating system and a small
sanitized reproduction at [GitHub issues](https://github.com/instruktlabs/kiln/issues).

If setup fails, retain the error, check Node/npm and network access, and follow the
setup guide. Do not delete an unfamiliar runtime or another installer's lock.

[Local privacy notice](PRIVACY.md) · [MIT license](LICENSE) ·
[Source](https://github.com/instruktlabs/kiln)
`,
    ),
  );
  const hashes = Object.fromEntries(
    [...files]
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([name, bytes]) => [name, `sha256:${createHash('sha256').update(bytes).digest('hex')}`]),
  );
  files.set(
    'package-provenance.json',
    json({
      schemaVersion: 1,
      kind: 'kiln-local-plugin',
      pluginVersion: release.version,
      engineVersion: pkg.version,
      executables: [executable],
      files: hashes,
    }),
  );
  return { files, version: release.version };
}

export async function packageLocalPlugin(destination, options = {}) {
  const directory = resolve(destination);
  const { files, version } = await expectedFiles();
  if (options.check) {
    const actual = await inventory(directory);
    const names = [...new Set([...files.keys(), ...actual.keys()])].sort();
    const changed = names.filter(
      (name) => !files.get(name)?.equals(actual.get(name) || Buffer.alloc(0)),
    );
    if (changed.length)
      throw new Error(
        `Local plugin is stale: ${changed.join(', ')}. Generate a fresh bundle and review its changes.`,
      );
    if (
      process.platform !== 'win32' &&
      ((await lstat(join(directory, executable))).mode & 0o111) !== 0o111
    )
      throw new Error(`Local plugin entry must be executable: ${executable}`);
    return { directory, version, files: files.size - 1, current: true };
  }
  // Refuse both populated and empty existing destinations, including symlinks.
  try {
    await lstat(directory);
    throw new Error('Plugin output already exists. Generate into a fresh directory.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory);
  for (const [name, bytes] of files) {
    await mkdir(dirname(join(directory, name)), { recursive: true });
    await writeFile(join(directory, name), bytes, { flag: 'wx' });
    if (name === executable) await chmod(join(directory, name), 0o755);
  }
  return { directory, version, files: files.size - 1 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const destination = args.shift();
  if (!destination || args.some((arg) => arg !== '--check'))
    throw new Error('Usage: node scripts/package-local-plugin.mjs OUTPUT_DIRECTORY [--check]');
  console.log(
    JSON.stringify(
      await packageLocalPlugin(destination, { check: args.includes('--check') }),
      null,
      2,
    ),
  );
}
