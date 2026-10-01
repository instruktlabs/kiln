/**
 * The MCP App resource the asset viewer is served under.
 *
 * Shared by the tool registry, which stamps it into `kiln_present`'s `_meta`,
 * and by the protocol core, which answers `resources/read` for it before the
 * engine has loaded. Neither of those may import the other, so the literal
 * lives here on its own.
 */
export const KILN_ASSET_WIDGET_URI = 'ui://kiln/asset-v5.html';
