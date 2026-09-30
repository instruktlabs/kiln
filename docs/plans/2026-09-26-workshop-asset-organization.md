# Workshop asset organization

Status: the first organization increment is implemented and installed; see the
[September 27 closeout](../reviews/2026-09-27-farm-comparison-closeout.md) for exact
scope and evidence. It adds aggregate Library, named-project membership controls,
explicit observation sources, and optional authoring-item identity. The broader
proposal below retains future work: a global source/project catalog, source-edit
lineage, structured per-refiner effort provenance and scalable indexed browsing.
Do not read these remaining proposals as delivered features. Full-pack production
remains deferred; see the [production plan](2026-09-26-farm-production-goal.md).

## Intended experience

The local Workshop has multiple named Projects and one Library view. Library
shows saved assets across explicitly registered collections and workspaces, with
source, project-membership, author/model, and standalone filters. An asset can
belong to zero, one, or several projects. Project membership points to an exact
saved revision; it does not determine the asset's storage location or ownership.

Select an asset or an in-progress authoring item to see its saved revision chain
and retained operations across CLI processes and MCP sessions. Inspect the exact
GLB with orbit, animation, captures, and comparison. Show who authored or refined
each revision, including requested and confirmed thinking settings. Save a reviewed
artifact to a chosen collection and optionally attach it to a named project's
inventory. Feedback continues through the author's conversation.

## Historical starting point before this increment

| Existing capability | Gap this follow-up addresses |
| --- | --- |
| Projects already have names, immutable revisions, inventory references, reviews, and conflict-checked updates. | Library and Live Review do not organize their complete browsing experience around those memberships. |
| Collections can be registered by CLI; `project` defaults to `<workspace>/assets/kiln`, and `library` to user storage. | These aliases are storage locations. The current Library browses collections separately and does not aggregate registered workspace projects, authorship, or live histories. |
| Saved assets have asset/revision IDs, optional parents, exact file hashes, and limited attribution. | IDs are local to a collection. Attribution does not record requested/confirmed effort, sessions, or author versus refiner roles. |
| Live Review records exact artifacts, project binding, one program reference, and a random session ID per host instance. | Each CLI invocation can create another session. Operations lack stable authoring-item identity and structured authorship. |
| `kiln_edit` returns `parentRef`; exact reviewed save records its operation ID. | The journal drops `parentRef`; ProgramStore retains source contents without a durable lineage graph. |
| The live viewer already orbits, compares, and guards Save against an unloaded or changed artifact. | Its save form takes only a name and fixes the destination to the `project` collection. It does not attach the result to project inventory. |

Relevant implementation: [projects.ts](../../src/projects.ts),
[assets-node.ts](../../src/assets-node.ts), [assets.ts](../../src/assets.ts),
[programs.ts](../../src/tools/programs.ts), [live-review.ts](../../src/live-review.ts),
[live-review-node.ts](../../src/live-review-node.ts),
[review.ts](../../src/tools/review.ts), and
[live-state.ts](../../src/viewer/live-state.ts).

## Shared contracts

### Registered sources and exact references

Add a versioned host catalog of explicitly registered sources. A source has a
stable `sourceId`, display label, kind (`workspace` or `collection`), and an
absolute local root resolved by the host. A workspace source exposes its existing
collections, projects, and observation journal; a collection source exposes saved
assets only. Registration must not copy assets or modify the registered source.
Existing comparison workspaces register read-only. Renaming a label does not
change identity, and removing a registration does not delete source files.

Use these qualified identities throughout catalog queries and UI selections:

- Asset revision: `{ sourceId, collectionId, assetId, revisionId }`.
- Project: `{ sourceId, projectId }`, with an exact `revisionId` when reading or updating.
- Observed operation: `{ sourceId, operationId }` plus its observation revision and artifact hash.

The host resolves IDs to registered roots; browser/API artifact requests never
accept arbitrary filesystem paths. Reuse existing path, file-integrity, origin,
and payload bounds. Registration is an explicit local host configuration action;
an authoring MCP client only sees sources granted by its host. Do not scan the
user's filesystem to find workspaces. Detect duplicate registrations of the same
resolved location rather than double-counting it. Surface unavailable sources
without treating them as empty or blocking healthy sources. Bound and paginate
catalog reads; do not read every GLB or rescan every source for each UI interaction.

Keep existing collection commands and aliases compatible. Label the aggregate
view **Library** and its user-storage destination **User library** so browsing and
storage are distinguishable. Preserve current workspace-local resolution when a
legacy reference has no `sourceId`. New cross-source references include it.

### Optional project membership

Extend the existing exact inventory reference to support a qualified source.
Project records remain versioned, with `expectedRevision` required for mutation.
Add shared attach, replace, and detach operations that update one inventory entry
without clients replacing an entire stale inventory array. Detach removes the
membership only. Several projects may reference the same saved revision; no copy
or ownership transfer is implied. Advancing one project's reference must not
advance another project's reference.

Keep **authored under project X/revision Y** in immutable build provenance separate
from **currently included in project Z**. Attaching an asset neither changes its
material locks nor proves that it meets the destination project's design or
trusted requirements. It must not trigger a rebuild or rewrite the original
project provenance. Standalone authoring remains the default without an explicit
binding; `projectId: null` / `--no-project` still overrides a configured default.

Project exports must resolve qualified inventory references through the same
host resolver, obtaining the exact saved material closure from the owning source
or portable record. Never substitute the destination project's current material
lock. An offline/missing source fails export clearly; it must not produce an
apparently complete pack. Existing editable/runtime distinctions stay intact.

### Authoring items, source lineage, and authorship

Introduce an optional durable workspace-scoped `workId` for an authoring item,
independent of project membership and provider sessions. A named item can exist
before its first saved revision. CLI invocations and MCP calls may explicitly
select that item; a host may provide an explicitly configured session default.
Separate model candidates receive separate IDs even if their display names,
project IDs, or source contents match. Unbound historical activity stays visible
as ungrouped activity; do not guess its ownership from names, timestamps, or the
currently selected project.

Retain bounded observation metadata for the item's canonical input and output
source hashes, an explicit edit-parent hash, and any exact saved asset reference
returned by a save. Preserve canonical hashes independently of short `p_` handles.
Record branch edges; do not force all edits into one linear "latest" chain. A
directly replaced source file only has a parent when the caller explicitly
declares one. Matching source/GLB hashes can identify equal content, not establish
that two logical assets or authors are the same.

Add versioned authorship metadata shared by observations and future saved
revisions: editing role (`author` or `refiner`), actor identity, requested model
and effort, separately confirmed model and effort, harness/version, session/run
IDs, and the evidence type supporting each confirmation. Missing confirmation is
unknown. In particular, the current Opus records confirm the model but only
request `--effort high`; Codex native `turn_context` confirms model and High effort.
Do not read or store hidden reasoning or secrets to populate these fields.

Critique is a separate attributed review, not edit authorship. Owner preference
and acceptance are separate annotations. An actual future change of refiner must
name the new editing actor and parent revision rather than attributing the result
to the original author automatically. Preserve old immutable manifests; show
historical ledger-derived attribution as a separate, evidence-labeled annotation.
The owner's Opus tractor and Astra cow selections, preference for future Astra
work, and requested cow Walk belong in these records, not model-specific routing
rules. The same Astra/High author continues the selected cow; its original parent
remains preserved.
The existing [comparison authorship ledger](C:/Users/Mattm/X/kiln-commons/farm-pilot/review/authorship-ledger.json)
is evidence, not a reason to hardcode Farm or these models into the contracts.

The journal remains bounded observation storage, currently 200 operations and
256 MiB by default. Show **retained operations**, including explicit gaps, beside
the durable saved revision chain. Its `operation.revision` is an observation
update counter, not an asset/source revision. Keep work identity and saved
associations durable outside journal eviction. Optional observation must not add
evaluation/capture calls, require a browser, or change an authoring result.

### Save exact artifact and optionally attach

Extend the shared reviewed-save operation with destination source/collection,
optional existing asset and parent revision, authorship, and an optional target
project/inventory item with `expectedProjectRevision`. Preserve the existing
operation revision, loaded artifact hash, source/GLB integrity, recorded runtime,
material closure, and trusted-requirements checks. A project membership choice
must never authorize changing trusted requirements.

Use a bounded durable request ID for save retries. Before writing, validate the
retained artifact, destination permissions, target identities, and the requested
parent. Commit the immutable saved revision once; then attach that exact reference
through a conflict-checked project update. Cross-store atomicity is not assumed.

Return structured outcomes: `saved`, `saved-and-linked`, or
`saved-link-pending`, always including the exact saved reference when save
succeeded. If the project changes or becomes unavailable after saving, keep the
saved asset, explain the attachment failure, and offer **Retry attachment** against
a refreshed project revision. Retry must reuse the saved reference rather than
create another asset revision. A failure before asset publication writes no
membership. Standalone Save requires no project. Saving into a read-only source
fails explicitly; the user can choose a writable collection without moving or
altering the original candidate.

## Implementation sequence and interfaces

1. Add host catalog/reference resolution and backward-compatible schemas. Expose
   aggregate saved-asset and named-project queries with bounded filters. Keep
   local registration separate from authoring authority.
2. Add authoring-item identity, canonical source edges, authorship, and exact save
   associations at the shared host/tool boundary. Record metadata once across
   direct CLI, MCP, and native adapters; retain authoring-result authority.
3. Add project attach/replace/detach and reviewed save/attachment recovery using
   the same domain functions. Expose authored-project provenance separately from
   membership in all returned records.
4. Build Library filters and per-asset history, then destination/project controls
   in Save. Reuse the existing orbit, animation, comparison, and loaded-artifact
   guards. Keep activity/run filtering as a secondary diagnostic view. Display
   source/model/effort labels and unknowns without implying a current running agent.

Tool schemas and behavior remain defined once in the shared registry. CLI and
dashboard routes call the same domain functions; MCP/native skins consume the
registry. Exact command spelling can follow the existing project, assets, review,
and collections command families. Add explicit work-item selection and membership
actions; reject newly accepted flags on commands where they have no effect. A
dashboard-only metadata store or a separate frontend project configuration is
outside this design. New authoring metadata must not alter deterministic geometry
or renderer routing.

Update the maintained setup/author/refine/QA skills, registered setup copies and
generated AGENTS/CLAUDE instructions with the same optional-project and source
registration semantics. Explain when projects help, how standalone work remains
valid, how to select a work item across CLI/MCP calls, and how to save or attach
without confusing storage with membership. Keep command examples tied to the
implemented registry/help. Add construction review of mating surfaces and motion
review of promised clips: an articulation probe does not satisfy a requested
walk cycle. These are general authoring checks, not Farm-specific mandatory
categories or guessed subject metadata.

## Verification and installed acceptance

Use focused failing tests before each behavior change, then the affected full
gates. The decisive cases are:

- Duplicate display names and local IDs across two registered workspaces remain
  distinct. Registration aliases do not duplicate results; unavailable/read-only
  sources and path/origin/body bounds have explicit behavior.
- A standalone asset appears without a project and can be attached to two named
  projects. Replacing/detaching one exact membership leaves the other, original
  bytes, material locks, and authored-project provenance intact.
- One authoring item spans several CLI processes and MCP operations; unrelated
  items in the same project do not merge. Edit branches, short/full source refs,
  failed/source-only operations, retention gaps, and unknown legacy attribution
  remain truthful. Critique does not become editing credit.
- Selection changes during GLB loading or an open Save dialog cannot save another
  operation. Exact save preserves bytes and preview identity without a new render.
  Concurrent parent/project changes, response loss after publication, and retry
  produce one saved revision and an accurate membership outcome.
- CLI, MCP, and dashboard return the same qualified identities, author/effort
  distinctions, filter results, and project updates. A project export includes
  the exact cross-source assets/resources or reports its missing source clearly.

Qualify the rebuilt installed package through the real interfaces. Register two
existing tractor comparison workspaces read-only in a separate Workshop host.
Browse both under Library, filter by author and project, and orbit their exact
first/refined revisions with correct author/High-effort labels. Verify their file
hashes before and after; no author receives another candidate's context and no
comparison source/configuration is changed. Legacy operations whose item/lineage
metadata is absent must remain labeled as incomplete rather than reconstructed
from appearance or names.

In a separate writable acceptance workspace, use a small technical standalone
fixture with zero projects. Exercise two CLI invocations and an MCP edit under one
work item, inspect the retained history in the dashboard, save the exact artifact,
create two named projects, and attach its exact revision. Force an attachment
conflict, recover without duplicate save, and verify a clean editable export/rebuild
with exact dependency closure. This is future functional qualification, not a new
model comparison or pack asset. No live providers are required for these cases.

## Boundaries

This follow-up is local asset organization and review. It does not launch, stop,
pause, retry, or proxy agents; feedback still goes to the current conversation.
It does not add cloud sync, filesystem-wide discovery, a terrain/scene editor,
automatic project binding, automatic artistic acceptance, or broader pack
production. It does not change GPU service policy, renderer fallback, or export
semantics. Candidate isolation, immutable originals, exact provenance, and
standalone assets remain required throughout.
