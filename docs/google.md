# Kiln with Google agents

Use Antigravity for a local Google workflow. It can launch Kiln's existing Node
MCP server directly. You do not need a public tunnel or an OAuth server for Kiln.
Sign in to Antigravity normally; your agent supplies the model.

## Antigravity CLI

Install and sign in using Google's [installation guide](https://antigravity.google/docs/cli/install/).
Install Kiln using the [installation guide](install.md). For the current tool set
from a checkout:

```sh
git clone https://github.com/matthew-kissinger/kiln
cd kiln
bun install --frozen-lockfile
bun run build:runtime
node scripts/create-workspace.mjs ../my-assets --harness agy
cd ../my-assets
node agy.mjs --model gemini-3.8-flash-high
```

Use the supported Bun 1.4.2 and Node 22.23.2 toolchain. A built package avoids the
Bun/build steps: run `npm exec --offline -- kiln-init ../my-assets --harness agy`
from its installation directory instead. Check [release compatibility](install.md#release-compatibility)
before following saved-asset examples with an older package.

Setup creates `.agents/mcp_config.json`, a local CLI launcher, `AGENTS.md`, and
authoring/refinement/QA skills with their references. The server entry sets
`KILN_RESULT_DETAIL=lean`: Antigravity writes a result over about 4,000 characters to a
file the model then reads back, and the lean review results cost it a quarter fewer
result characters in the readiness cycle's paired sessions; a call's own `detail` still
wins. Start a new conversation in this workspace and accept normal project/tool trust
prompts. Try:

> Read AGENTS.md and skills/kiln-author-asset/SKILL.md. Use the kiln_workspace MCP
> server. Check its capabilities, make a blue one-metre cube on the ground,
> render it, and review the returned image. Report any connection error.

Then describe the asset you want. Ask for a rendered review and save a revision
after accepting the result. Run `node kiln.mjs view` to open the local asset
library. Keep the source alongside the GLB for later edits.

Run `agy models` to check your account's available models. Do not assume a generic
Flash alias pins 3.8. Google documents [model selection](https://antigravity.google/docs/models/)
and [local MCP configuration](https://antigravity.google/docs/mcp).

## Antigravity desktop or IDE

Create the same workspace with `--harness agy`, then open that folder as a project
in Antigravity. The generated MCP configuration uses Google's documented local
`mcpServers` structure. In the IDE, open **MCP Servers → Manage MCP Servers** to
check the connection. Antigravity 2.0 exposes installed MCP servers under
**Settings → Customizations**. Refresh if needed and start a fresh conversation.

Select the desired Gemini model beneath the prompt box. Ask the agent to read
the workspace's `AGENTS.md` and skill files, then run the connection check above.
The copied skills are ordinary readable project files; the generated setup does
not promise native slash-command registration. Native Antigravity plugins are
an optional packaging route, documented by [Google](https://antigravity.google/docs/plugins/).

These desktop steps follow current official documentation. The latest direct Kiln
probe verified the CLI, not an Antigravity desktop recording. Confirm actual tool
calls, image receipt and local viewer behavior in your desktop version.

## Gemini Spark in the browser

Spark uses a separate remote connection. Google's setup starts at **Connected Apps
→ Custom apps**, where you enter an MCP server URL and complete account linking.
Local stdio commands are not a documented browser connection method.
[Google's custom-app instructions](https://support.google.com/gemini/answer/17209137).

Kiln's private compatibility experiment reached registration and its OAuth consent
page, but Chrome blocked the final submission. Token exchange, tool execution,
inline 3D viewing and downloads in Spark remain unverified. A selected Flash model
in ordinary Gemini Chat does not establish Spark's backend version.

Do not use the experiment's handwritten OAuth server and rotating tunnel setup
as installation instructions. A maintained remote deployment needs authentication,
isolated asset storage and a reachable viewer/download route. A tunnel supplies
connectivity; it does not supply those application features.

## Troubleshooting and verification

- **No tools:** open the generated project, accept trust, restart the conversation,
  and check `kiln_workspace`. A globally configured `kiln` may use another install.
- **Skill absent:** ask the agent to read the project skill's `SKILL.md`; keep its
  referenced files adjacent. Native plugin registration is a separate host feature.
- **No inline 3D card:** MCP image feedback and MCP Apps are separate capabilities.
  Use `node kiln.mjs view` for the local interactive viewer.
- **Gemini CLI rejected:** our September 8 probe of Gemini CLI 0.59.0 with an
  individual account returned `UNSUPPORTED_CLIENT` and directed migration to
  Antigravity. This does not establish that every Gemini CLI authentication method
  is unavailable. Follow Google's [migration guide](https://antigravity.google/docs/cli/gcli-migration/).

Direct probe, September 8, 2026: Antigravity CLI 1.1.27 selected
`gemini-3.8-flash-high`, read project guidance, called `kiln_workspace` capabilities
and render tools, and received a six-view PNG. A separate Hub probe using fresh public checkout c85a76b5b71c8f985c1ae1f762c44c5cb2601a61 also completed native capabilities/render and image inspection after normal Google sign-in. The earlier Windows checkout includes
unreleased fixes. CPU feedback establishes geometry/base color, not PBR material
fidelity. This was a connection check, not a generation-speed benchmark.

### First interactive launch

Finish Antigravity's initial onboarding, then start a fresh CLI session. Before
submitting an asset prompt, open `/mcp` and wait until `kiln_workspace` is connected
and its tools are listed. A September 8 Hub test succeeded in print mode but its
first interactive session did not expose the MCP tools to the agent. Restarting
after onboarding and checking the normal MCP manager restored native tool access
without changing Kiln's configuration. The exact initialization cause is not yet
proven; this is a tested readiness check, not a claim that every installation
requires a restart. Keep setup checks outside a recorded creation prompt.

The corrected Hub session then created a battleship from a short user prompt,
reviewed Kiln's returned images, saved source and GLB, and resumed the same
conversation to paint the three turret roofs dark red. The child revision retained
its parent; both GLBs passed validation, and the exported bundle matched the saved
source and GLB. The geometry binary was unchanged by the material edit. Native
MCP calls and the actual local viewer were recorded. This verifies Antigravity
CLI 1.1.27 with `gemini-3.8-flash-high` and public checkout `c85a76b5`, not desktop
operation or the older eight-tool release package. No Antigravity desktop install
was found in the Hub's checked package and launcher locations.
