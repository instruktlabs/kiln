# Managed-image startup control

This private diagnostic isolates basic Cloudflare Container startup from Kiln,
custom image preparation and the previous cf Build Output configuration. It uses
Wrangler 4.147.0 with ordinary explicit Durable Object and service bindings.
It is not a production evaluator and accepts no source, image, command or run ID.

The owner authorized a five-job private trial with a $1 allowance. Two jobs were
already attempted. This candidate consumes **at most one** of the three remaining
jobs, leaving two for subsequent controls. Do not delete/recreate the namespace,
change the fixed job ID, or redeploy a copy to regain an invocation. Even an
interrupted or failed invocation keeps its durable claim. Cleanup alarms do not
start another instance. This control does not reset or expand the allowance.

## Fixed scope

- Worker `kiln-private-startup-diagnostic`, application
  `kiln-private-managed-startup`, one SQLite Durable Object namespace.
- No public route, domain, workers.dev or version preview URL. Both HTTP handlers
  return 404. A private service binding invokes `KilnStartupControl.runFixed()`.
- `cloudflare/debian-trixie`, `standard-2`, Internet disabled, no snapshots,
  provider secrets, storage bindings, custom image upload or installed Kiln package.
- A fixed Node command returns only its version and numeric UID/GID. The managed
  image currently supplies Node 24.20.0; a different version fails this control.
  It does not change Kiln's pinned Node 22.23.3 release runtime.
- One 60-second deadline with a durable alarm, 1-KiB bounds on each output stream,
  five-second awaited destruction/inspection, and a cleanup recovery alarm if
  destruction cannot be confirmed. No arbitrary process output or exception text
  is retained. A process failure and a teardown failure have separate phase marks.

At the rates checked on 6 October, 65 seconds of fully busy `standard-2` usage is
approximately $0.00233 in Container CPU/memory/disk before included allowances.
Worker/DO/log charges are additional. Keep the existing $1 trial allowance and
read back resource absence after cleanup; this estimate is not a provider-enforced
dollar cap or an actual invoice.

## Preparation and evidence

Run the hosting checks from `hosting/` after the root install/runtime rebuild
required by `hosting/AGENTS.md`. `startup-diagnostic.test.mjs` covers fixed offline
execution, one-use admission, HTTP denial, structured private RPC, phase attribution,
failed startup, bounded output/deadlines and cleanup/recovery. Its workerd fixture
has no real Container; it proves fail-closed behavior, not provider availability.

Prepare with pinned Wrangler, using an absolute output directory inside ignored
root `.cache/`:

```powershell
fnm exec --using 22.23.3 npm.cmd exec --yes --package=wrangler@4.147.0 -- wrangler deploy --config hosting/probe/startup.wrangler.jsonc --dry-run --outdir <ABSOLUTE_IGNORED_DIRECTORY>
```

Before live execution, retain the exact commit, final bundle SHA-256, validated
configuration, deployment/version/application/namespace IDs and start timestamp.
Inspect the uploaded code and public URL flags. Invoke the fixed RPC once through
a loopback-only local operator that rejects browser-origin requests. A second
read returns the retained result; it must never cause another start. Stop after
failure and inspect the phase trace before preparing another image or policy.

After retaining the result, stop the local operator, delete only this diagnostic's
application and Worker, and verify its instance and namespace absence. There is
no custom registry image to delete for this control. A successful command proves
basic managed-image execution only. It does not prove custom image execution,
Kiln evaluation, hostile-source isolation or a launch-ready service.

An expired `CLOUDFLARE_API_TOKEN` environment override was found during preparation.
Removing that override in the command process allowed both CLIs to use the owner's
valid saved OAuth sessions. Never print or copy credentials, clear saved profiles,
or request another login merely because that override has expired.

Sources: [native API](https://developers.cloudflare.com/containers/api/durable-object-container/),
[managed image](https://developers.cloudflare.com/containers/guides/image-management/),
[Wrangler configuration](https://developers.cloudflare.com/containers/reference/wrangler-configuration/),
[pricing](https://developers.cloudflare.com/containers/platform/pricing/).
