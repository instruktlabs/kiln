# Compiled game inputs

`game-inputs.mjs` stages the reviewed H-7 production bundle after Astro builds.
It never installs or rebuilds game dependencies with the Kiln lockfile. The game
owns `/play/h-7/index.html`; `/play/` is the indexed site listing.

`src/data/game-inputs.json` pins an immutable asset-host ZIP by source commit,
archive SHA-256 and size, and an exact per-file SHA-256/size inventory. ZIP files
contain the production output at their root, including the game's licence and
third-party notices. Unknown files, source maps, authoring files, traversal,
duplicate paths and symlinks are rejected. The build receipt rechecks the staged
inventory after the remaining site build steps and records the game commit and
archive digest. No private checkout path enters the receipt.

The game source repository remains private and the game retains its proprietary
licence. Compiled runtime JavaScript remains publicly downloadable; minification
does not provide secrecy or change ownership. Update the manifest only from a
reviewed production build with sourcemaps disabled and base `/play/h-7/`.
