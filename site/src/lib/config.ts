import release from '../data/release.json';
export const VERSION = release.version;
export const VERSION_SHORT = VERSION.replace(/\.0$/, '');
export const RELEASE_TAG = `v${VERSION}`;
export const SITE = 'https://kilnstudio.tools';
export const REPO = 'https://github.com/matthew-kissinger/kiln';
export const ASSET_BASE = 'https://assets.kilnstudio.tools';
export const PACKS_ENABLED = !['0', 'false'].includes(import.meta.env.KILN_SITE_PACKS ?? '1');
/** The release attaches its tarball and SHA256SUMS.txt (0.10.0 onward); registry publication is planned for 1.0. */
export const PACKAGE_TARBALL = `kiln-engine-${VERSION}.tgz`;
export const RELEASE_URL = `${REPO}/releases/tag/${RELEASE_TAG}`;
export const PACKAGE_DOWNLOAD_URL = `${REPO}/releases/download/${RELEASE_TAG}/${PACKAGE_TARBALL}`;
export const INSTALL_COMMAND = `npm install /absolute/path/to/${PACKAGE_TARBALL} --omit=dev --include=optional`;
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
