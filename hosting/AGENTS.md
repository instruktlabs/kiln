# Private hosted service

This package has its own npm lockfile. Cloud dependencies and hosting modules must
not enter the engine's published package. Keep the OAuth gateway, tenant Worker and
native evaluator separate; only the gateway receives identity-provider credentials.

For changes here, use the pinned root maintainer tools and run from this directory:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

The `Hosted gateway checks` workflow runs these gates on Linux and Windows.
Local workerd fixtures do not establish live OAuth, native evaluation, provider
isolation or production costs. Test helpers and fault controls must not appear in
production bundles. Derive MCP tools from the engine registry; do not duplicate
schemas here. See the root guide for TDD, publication authority and secret handling.
