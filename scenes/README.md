# Kiln scenes

The maintained Farm, Golden Gate, Foundry Floor and shared scene-kit sources live
here. They were integrated from the separate authored scene workspace for the v0.9
site rollout. Generated capture evidence and asset payloads are kept out of Git.
Historical milestone documents describe their original runs, not current release acceptance.

Install with `bun install --frozen-lockfile` in this directory. Scene dependencies
are separate from engine and site dependencies. Run `bun run typecheck`, `bun run lint`
and `bun run test` for the portable source contracts. The runner explicitly lists
19 author-input suites that belong to `bun run test:integration`; several other
asset-dependent cases also report their existing fixture skips. Browser and asset-integration scripts
require staged inputs; authoring scripts that regenerate packs also require their
original author workspace. They are not generic clean-checkout tests.

For the production site, follow [the deployment guide](../site/DEPLOYMENT.md).
`site/scripts/scene-inputs.mjs` restores the exact reviewed scene packs and standalone
bundles under `.cache/site-inputs/`, with public archive and per-file hash checks.
The site builds Farm directly from this source, and serves the reviewed Golden Gate
and Foundry chunks without rewriting them. Use the scene kit's `sceneStandaloneConfig`
and verified asset packs when building a new standalone revision; changing source
requires requalification and new runtime pins before a site release.

Current scene inputs are Farm r36-local-review, Golden Gate g9 and Foundry ff3-review2.
Those revision names are retained for provenance. Foundry remains an in-production
preview, with AMRs and arms transporting containers and humanoids doing maintenance.
