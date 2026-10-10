import release from '../../../.github/published-candidate.json';
export const VERSION = release.version;
export const VERSION_SHORT = VERSION.replace(/\.0$/, '');
export const RELEASE_TAG = `v${VERSION}`;
export const SITE = 'https://kilnstudio.tools';
export const REPO = 'https://github.com/instruktlabs/kiln';
export const DISCORD = 'https://discord.gg/fSWVbMdQXK';
export const ASSET_BASE = 'https://assets.kilnstudio.tools';
export const PACKS_ENABLED = !['0', 'false'].includes(import.meta.env.KILN_SITE_PACKS ?? '1');
/** Published npm releases also attach the exact archive and checksum to GitHub. */
export const PACKAGE_TARBALL = `instruktlabs-kiln-${VERSION}.tgz`;
export const RELEASE_URL = `${REPO}/releases/tag/${RELEASE_TAG}`;
export const PACKAGE_DOWNLOAD_URL = `${REPO}/releases/download/${RELEASE_TAG}/${PACKAGE_TARBALL}`;
export const INSTALL_COMMAND = 'npm install @instruktlabs/kiln';
export const WORKSPACE_COMMAND = 'npx --offline --no -- kiln-init ../my-assets --harness opencode';
export const HARNESSES = [
  'claude',
  'codex',
  'opencode',
  'hermes',
  'agy',
  'copilot',
  'cursor-agent',
];
