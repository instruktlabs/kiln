import release from '../data/release.json';
export const VERSION = release.version;
export const VERSION_SHORT = VERSION.replace(/\.0$/, '');
export const RELEASE_TAG = `v${VERSION}`;
export const SITE = 'https://kilnstudio.tools';
export const REPO = 'https://github.com/matthew-kissinger/kiln';
export const ASSET_BASE = 'https://assets.kilnstudio.tools';
export const PACKS_ENABLED = !['0', 'false'].includes(import.meta.env.KILN_SITE_PACKS ?? '1');
export const INSTALL_COMMAND = `npm install "${REPO}/archive/refs/tags/${RELEASE_TAG}.tar.gz" --omit=dev --include=optional`;
export const WORKSPACE_COMMAND = 'npm exec --offline -- kiln-init ../my-assets --harness opencode';
export const HARNESSES = [
  'claude',
  'codex',
  'opencode',
  'hermes',
  'agy',
  'copilot',
  'cursor-agent',
];
