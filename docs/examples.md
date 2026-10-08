# Asset examples

For recent work, browse the [gallery](https://kilnstudio.tools/gallery/) and
[interactive scenes](https://kilnstudio.tools/scenes/). Download Runtime assets for
an application or Editable assets to retain the authored sources and revisions.

| Collection | Sources and examples |
| --- | --- |
| Troy | [Horse, ships, characters, buildings and props](https://github.com/instruktlabs/kiln/tree/main/packs/troy) |
| Farm | [Buildings, animals, crops and equipment](https://github.com/instruktlabs/kiln/tree/main/packs/farm) |
| Vehicles | [Six road vehicles and saved revisions](https://github.com/instruktlabs/kiln/tree/main/packs/vehicles) |
| Golden Gate Bridge | [Standalone bridge sources](https://github.com/instruktlabs/kiln/tree/main/packs/golden-gate-bridge) |
| Foundry Floor | [Factory asset sources](https://github.com/instruktlabs/kiln/tree/main/packs/foundry-floor) |

Follow the [asset source guide](https://github.com/instruktlabs/kiln/blob/main/packs/README.md)
to restore a collection into a separate workspace. Saved material dependencies
and the recorded engine version matter when rebuilding an existing asset.
Scene interaction code is separate from the models.

For small examples of current APIs, use `kiln_discover` or `kiln discover`. Its
helper examples and recipes come from the maintained engine catalog, not the
repository's historical `examples/` folder. Neither that folder nor the asset
packs are bundled into the npm package or automatically supplied to an agent.

## Historical collection

The old standalone examples are preserved in the [website archive](https://kilnstudio.tools/gallery/archive/)
and [Git history](https://github.com/instruktlabs/kiln/tree/fda71ac775750f25390b6ee30082ebc56463edc6/examples).
They are historical showcases, not recommended implementations or quality baselines.

They are no longer part of the active source tree. Contributors building the
archive gallery or running the full regression corpus can restore the exact
programs, credits and image records into an ignored cache:

```sh
node scripts/example-archive.mjs --fetch
```

Run this from an engine checkout. It does not add files to a user's asset workspace
or change the npm installation. No teaching collection or asset-discovery index
is added. Small engine-specific regression fixtures remain under tests.
