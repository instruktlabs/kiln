# Viewer texture regression

After `bun run build:viewer`, run:

```sh
node scripts/integration/run-viewer-textures.mjs --playwright /path/to/playwright
```

This uses an existing Playwright installation and isolated Chrome profile. It
does not install dependencies, change browser protections, call models or use a
hosted service. `--bun` selects an existing Bun executable. Results and a component
screenshot are retained in the reported temporary folder.

The local page uses `connect-src 'none'` and `img-src 'self' data:`. Before the fix,
Three.js ImageBitmapLoader fetched blob/data URLs, the browser blocked those
connections, and GLTFLoader resolved with a missing material map. The fixed
viewer uses GLTFLoader's registered plugin and LoadingManager image handler:
embedded images become in-memory data URIs and TextureLoader uses the image path.
The source GLB is unchanged and no network permissions are added. Samplers,
color spaces, UV transforms and material extensions stay owned by GLTFLoader.

Checks cover embedded and data-URI PNG pixels, sampler/UV/color-space preservation,
corrupt-image rejection, and external-resource rejection. The built chat component
must visibly render both fixture colors, label fallback to the saved preview,
clear stale geometry without a preview, and recover on the next valid asset.
Pixel checks here test the viewer regression, not engine QA acceptance or GPU
performance. Expected corrupt-image loader errors remain in the receipt.

The regression failed before the fix and passed in Chrome 154.0.8037.98 on
October 9, 2026. This is local browser evidence. The RPC messages emulate a host;
they do not establish actual ChatGPT host acceptance, which must be checked with
the released component and CSP enforcement enabled.

Supported APIs: [GLTFLoader.register](https://threejs.org/docs/pages/GLTFLoader.html#register)
and [LoadingManager.addHandler](https://threejs.org/docs/pages/LoadingManager.html#addHandler).
