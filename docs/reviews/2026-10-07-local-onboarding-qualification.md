# Local client onboarding qualification

Status: candidate and fixtures prepared; model sessions have not run.

## Candidate and current evidence

Use source `76c869aa7c8637b222b5bdf956fd1e70c3f9d83a`, with the exact
`@instruktlabs/kiln@1.1.0-dev.1` archive downloaded from
[CI run 37668542892](https://github.com/instruktlabs/kiln/actions/runs/37668542892).
Its SHA-256 is
`98407508d8ec599189851aa0bd8b86313ac3abbd25e6337ac97f8510cc72215b`.
This is an unpublished development candidate, not a replacement for stable 1.0.0.

The archive's plugin inventory verifies. Claude Code 2.1.287 and Codex CLI
0.160.0 both installed that candidate through their native marketplace commands
in separate temporary client profiles. The fixture marketplace has a private
test name; public naming and directory submissions remain on hold.

Codex's native application server sees one setup skill, the existing owner skill,
and only the synthetic owner's MCP server before setup. It sees no author/refine/QA
skills prematurely. The owner's MCP server responds correctly, and all seven
existing-project baseline files remain unchanged. These checks used no model
credentials or model conversations. System skills supplied by Codex are present
and are recorded in the private receipt; this is not a claim of a bare model.

A separate attempt to load the plugin using only per-invocation marketplace and
enablement settings did not install or discover its setup skill. The correctly
parsed marketplace appeared as available but uninstalled. That shortcut is not
used as onboarding evidence. Use the successfully installed isolated profile;
do not copy authentication files or change the owner's ordinary client settings.

Private preparation and discovery receipts are in
`.cache/onboarding-76c869a-{preparation,fixture-checks,discovery}.json`. Earlier
failed per-invocation attempts are retained separately. Fixtures live outside the
engine checkout under a dedicated temporary directory recorded in those receipts.
The separate `.cache/onboarding-76c869a-installed-integrity.json` receipt verifies
all eleven inventoried files in each native installed cache against the exact
archive's plugin, with no model calls. It excludes the unsuccessful shortcut.

## Bounded live sequence awaiting approval

Each case has two sessions: setup, then a restarted session in the resulting
project. Run sequentially and review each result before proceeding.

| Case | Setup | After restart |
| --- | --- | --- |
| Claude new | Select the installed setup skill and create a workspace | Discover the live engine, create/review/save a matte blue crate, export source and GLB |
| Claude existing | Adopt a project with owner instructions, MCP configuration and a skill | Perform the same asset flow and verify preservation |
| Codex new | Select the installed setup skill and create a workspace | Perform the same live tool and delivery flow |
| Codex existing | Adopt the populated fixture | Perform the same asset flow and verify preservation |

The prompts identify the desired result, reviewed archive, runtime-data directory,
preservation requirements and read-only preview. They do not supply asset source.
Setup and tool use must come from the client and its installed skill. The helper's
reviewed `--archive` option is required because this version is unpublished.

Proposed allowance: four Claude sessions, each with a $1 client-estimated limit
and 20-turn limit, plus four sessions using the owner's existing Codex Pro access.
Each process has a ten-minute deadline and bounded retained output. Claude's cost
limit is an estimate, not a provider billing hard cap. Stop at the first failure,
budget/permission denial or missing evidence; do not automatically retry.

The prepared driver is `.cache/run-onboarding-case.mjs`; without `--run-live` it
only writes the command plan. All eight command plans and its syntax check pass.
No live invocation has been authorized or performed by this checkpoint.

Claude uses the existing API credential only when an approved session starts,
with its isolated client profile. Its child tools may inherit that credential;
the test must not claim universal environment stripping. Other provider/cloud
credentials are not inherited. npm uses empty configuration files and a fixture
cache. No credential values are written into command plans.

The Codex test profile still needs the owner's normal browser sign-in. That is
separate from the existing desktop login. The driver checks login status before
starting a session and never copies an authentication file. Fixture project trust
and server-specific MCP choices are scoped to the test profiles/invocations.

Automatic client permission review remains enabled; permission bypass flags are
not used. Unattended runs do not demonstrate the interactive project/MCP trust
dialog. Record that limitation and check the user-facing trust flow separately.

## Acceptance evidence

- Exact installed engine and plugin bytes match the qualified archive and pin.
- The model selects the installed setup skill, previews and applies setup without
  replacing unrelated files, instructions, skills or configuration.
- The restarted client discovers one `kiln_workspace` and the expected skills;
  the original MCP server and skill remain available in existing projects.
- Actual tool traces show discovery, authoring, image delivery, review, saving
  and export. Report the selected model, client version, cost/usage and inherited
  configuration. Model claims alone do not prove completion or image quality.
- Inspect the saved revision, source and exported GLB independently. Compare
  owner-file hashes and retained MCP entries against their baselines.
- CPU views are geometry evidence. This matte fixture does not establish material
  fidelity or replace the separate software-rendering qualification.
- Retain failed results and next steps. Terminal process exit alone is not success.

Source basis: [Claude CLI reference](https://code.claude.com/docs/en/cli-reference),
[Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference),
and [Codex noninteractive mode](https://learn.chatgpt.com/docs/non-interactive-mode),
checked on 7 October 2026. This check publishes, deploys and submits nothing.
