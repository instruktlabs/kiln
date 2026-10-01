# Cloudflare deployment

The production site is a direct upload to the `kilnstudio` Cloudflare Pages project,
whose production branch is `production`. The code is maintained on GitHub `main`.
GitHub Actions validates the engine and website; it does not deploy the site.
Package publication is separate and remains deferred to v1.0.

Use the versions in `toolchain.json`. From the repository root:

```sh
bun install --frozen-lockfile
cd scenes
bun install --frozen-lockfile
cd ../site
bun install --frozen-lockfile
bun run assets
bun scripts/build-skills-discovery.mjs
bun run build
bun scripts/validate-static.mjs
bun scripts/verify-assets.mjs
```

The default build includes Commons downloads and all three scenes. It fetches only
SHA-256-pinned public objects from `assets.kilnstudio.tools`. `KILN_ASSET_MIRROR`
can name a local mirror with exactly the same relative paths and bytes. The site
uses this repository's `docs/`, `skills/` and `scenes/` by default. Farm is bundled
from scene source; Golden Gate and Foundry use their sealed reviewed standalone
chunks. `scene-inputs.json` pins their complete inputs and `scene-packs.json`
independently verifies each model, data file and runtime chunk.

`KILN_SITE_PACKS=0` is the reduced CI build; never use it for the production rollout.
The authoritative R2 upload sets are `mirror-manifest.json`, `upload-manifest.json`
and `scene-inputs.json`. Preserve existing versioned objects; verify each upload
against its declared SHA-256 and check the public download URLs before deployment.

After authorization, merge through the required main-branch checks and build again
from clean `main`. Review the result, then use:

```powershell
pwsh -File site/scripts/deploy.ps1 -DryRun
pwsh -File site/scripts/deploy.ps1
```

The script rejects a dirty checkout, a build from another commit, a build made with
packs disabled, and Pages file-limit violations. Wrangler must already be installed
and authenticated. It does not create credentials or change DNS.

For the initial migration, first create the Pages project, deploy and verify its
`pages.dev` address, then associate `kilnstudio.tools` as a custom domain and replace
its GitHub Pages DNS records with the Pages target. Preserve `assets`, `app`, `mcp`
and other unrelated services. Retire GitHub Pages only after the new apex is verified.

Verify `build-info.json` against the exact main commit, the artifact manifest and
scene hashes, download URLs and the real gallery/scene flows over HTTPS. A successful
upload alone is not deployment verification. Keep the deployment ID and receipts.
