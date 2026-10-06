# Hosted Kiln

This private package contains the hosted service's Worker code. It is not shipped
inside `@instruktlabs/kiln` and introduces no cloud dependency into the engine.
It is not deployed or ready for public traffic. Native provider qualification,
the tenant backend, durable assets, quotas and operations remain separate work.

## Local checks

Use the repository's Node 22.23.3 and npm 12.2.0 maintainer toolchain:

```sh
cd hosting
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

The tests execute the Worker in workerd through the pinned Miniflare package.
Its 5.x API is currently alpha; the exported v4 option converter supplies the
documented simulation bindings. Tests replace GitHub network responses with fixed
identities and use a test-only Durable Object that records requests. Unexpected
external fetches fail. No model, real identity provider or cloud deployment is
used. This proves the authorization and routing boundary, not engine execution,
asset persistence, global KV consistency or production capacity.

The production-only bundle and input/hash receipt are written to
`../.cache/hosted-worker/`. `build` performs no upload, resource provisioning or
deployment. `Hosted gateway checks` runs the same checks on Linux and Windows.

## Authorization and tenant routing

`src/worker.ts` combines the OAuth authorization server and protected resource
server using `@cloudflare/workers-oauth-provider@1.2.1`. Their logical roles remain
separate. The canonical resource is `PUBLIC_ORIGIN + /mcp`; origin is operator
configuration, never a forwarded header. HTTP origins other than that configured
HTTPS origin are refused.

The Worker serves resource/issuer discovery, client registration, browser consent,
authorization-code exchange, refresh and revocation. Client ID Metadata Documents
are enabled; the deployed Worker must set `global_fetch_strictly_public` to bound
their network fetches. Dynamic registration is retained for client compatibility.
Registration and other public endpoints still need operational admission limits
before deployment.

GitHub sign-in is a provisional v1 choice pending the owner's open preference
question. The adapter requests no repository scopes, uses upstream S256 PKCE,
and resolves the current GitHub user for every login. Only `github-<immutable id>`
becomes a subject. Login names and email addresses are not tenant identifiers.
Upstream tokens are used only for the identity lookup and are not stored or passed
to the backend. This needs a dedicated Instrukt Labs OAuth app; no app or secret
has been provisioned by this implementation.

Consent names the requesting client, verified domain when available, callback
host, scopes and loopback warning. The library binds consent and upstream state
to HttpOnly, Secure browser cookies; the form additionally checks its exact
origin. Client-supplied strings are escaped. The page forbids scripts and framing.
The `kiln:use` scope permits the engine's asset lifecycle, including deletion;
`offline_access` permits a renewable connection with a fixed 30-day lifetime.
Access tokens expire after 15 minutes. Revocation uses the advertised endpoint.
Production KV propagation means the local revocation test does not promise
instant global revocation; this needs explicit operational qualification.

Verified OAuth subjects alone select a Durable Object, using a versioned hash of
issuer and subject. Reconnecting through another client selects the same tenant.
Bearer tokens, cookies, session ids, caller tenant headers and program references
cannot choose the object. Only bounded MCP transport headers and request bodies
cross the private binding. The tenant backend must still authorize all references
inside its own storage; this gateway does not treat an opaque reference as access.

The resource handler currently forwards `/mcp` and authenticated downloads at
`/mcp/artifacts/<opaque-id>`. It defines no tools: the native backend must derive
its MCP surface from the engine registry. API bodies are bounded to 1 MiB while
reading; OAuth bodies to 16 KiB, with a ten-second read deadline. Resource URLs
reject query parameters, including bearer credentials. Responses are not cached,
and application error responses omit raw exceptions and upstream responses.

## Required deployment bindings

| Binding | Purpose |
| --- | --- |
| `PUBLIC_ORIGIN` | `https://kiln.instruktlabs.com`; final environment must verify ownership/TLS |
| `OAUTH_KV` | Dedicated OAuth records, separate from user artifacts |
| `GITHUB_CLIENT_ID` | Dedicated identity app's id |
| `GITHUB_CLIENT_SECRET` | Worker secret; never source, CI output or a browser variable |
| `TENANTS` | Private namespace of the separate tenant Worker; not a public evaluator endpoint |

Keep OAuth and GitHub secrets out of that separate tenant Worker and all evaluator
containers. Final deployment configuration must bind the real reviewed resources;
there is deliberately no deploy command or fabricated namespace id here.

Before launch, complete native isolation on the actual Cloudflare provider,
tenant engine/storage integration, two-user asset/download denial tests, retention,
admission/cancellation and cost controls, identity-provider setup, live client
connections, support/privacy pages and exact deployed identity verification.

Sources checked 6 October 2026:
[Cloudflare OAuth library](https://github.com/cloudflare/workers-oauth-provider),
[MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
[GitHub OAuth flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
