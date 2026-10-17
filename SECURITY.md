# Security policy

## Scope and supported versions

This policy covers the Kiln engine, CLI, MCP server, local render service,
and plugin packages maintained in this repository.

Security fixes target the latest stable engine and plugin releases.
Older releases do not have separately maintained security branches.
Reports affecting any version are welcome; resolving an issue may
require upgrading to a current release.

## Report a vulnerability

Email support@instruktlabs.com with the subject "Kiln security report".

Include, where available:

- The affected engine and plugin versions.
- Your operating system and Node version.
- The affected command, tool, or integration.
- A small, sanitized reproduction.
- The observed behavior and potential impact.

Do not include credentials, private assets, or unrelated personal data.
Do not post exploit details or sensitive reports in public GitHub issues.
We will coordinate investigation and disclosure with the reporter.
This project does not promise a fixed response or resolution time.

For ordinary bugs and feature requests, use:
https://github.com/instruktlabs/kiln/issues

## Local execution boundaries

Kiln evaluates authored JavaScript. The packaged CLI and MCP server
use a subprocess with execution and output limits by default.
That subprocess is not a complete security sandbox.

Do not treat Kiln's evaluator as sufficient isolation for running
untrusted programs with access to sensitive host resources.

See the runtime documentation for execution modes and limits:
https://github.com/instruktlabs/kiln/blob/main/docs/runtime.md
