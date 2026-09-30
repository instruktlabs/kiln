/// <reference lib="dom" />
import type { LiveOperation, LiveSnapshot } from '../live-review';
import type { ProjectRevision } from '../projects';
import { createAssetStage } from './scene';
import { describeLevels, levelLabels } from './lod';
import {
  reconcileReview,
  selectReviewOperation,
  reviewedSaveRequest,
  visibleReviewOperation,
  type ReviewState,
} from './live-state';
import type { AssetManifest } from '../assets';
import { mountPerformanceControl } from './performance-control';
import { mountMembership } from './membership-panel';
import { el, node, request, empty, notice, remember, recall, shortId } from './dom';

export function mountLiveReview() {
  let state: ReviewState = { following: true, crossRunContinuity: true, operations: [] };
  let allOperations: LiveOperation[] = [];
  let cursor = '';
  let generation = 0;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let currentStage: ReturnType<typeof createAssetStage> | undefined;
  let comparisonStage: ReturnType<typeof createAssetStage> | undefined;
  let loadedCurrent: LiveOperation | undefined;
  let loadedComparison: LiveOperation | undefined;
  let loadGeneration = 0;
  let compareGeneration = 0;
  let wire = false;
  let recoveredPreference = false;
  const projectSelect = el<HTMLSelectElement>('live-project');
  const sourceSelect = el<HTMLSelectElement>('live-source');
  const livePath = (path: string) =>
    sourceSelect.value
      ? `${path}${path.includes('?') ? '&' : '?'}source=${encodeURIComponent(sourceSelect.value)}`
      : path;
  const runSelect = el<HTMLSelectElement>('live-run');
  const workSelect = el<HTMLSelectElement>('live-work');
  const selectedStorage = () =>
    `kiln.live.selection.${sourceSelect.value}.${projectSelect.value}.${workSelect.value}.${runSelect.value}`;
  const pinStorage = () => `kiln.live.pin.${sourceSelect.value}`;
  const visibleOperations = () =>
    allOperations.filter(
      (op) =>
        (!runSelect.value || op.sessionId === runSelect.value) &&
        (!workSelect.value ||
          (workSelect.value === 'ungrouped' ? !op.workId : op.workId === workSelect.value)),
    );
  const connected = (value: boolean, message: string) => {
    const badge = el('live-connection');
    badge.textContent = value ? 'Connected' : 'Reconnecting';
    badge.className = `pill ${value ? 'connected' : 'warning'}`;
    el('connection-status').textContent = message;
  };
  function renderRuns() {
    const work = workSelect.value;
    const workIds = [...new Set(allOperations.flatMap((op) => (op.workId ? [op.workId] : [])))];
    workSelect.replaceChildren(
      new Option('All authoring items', ''),
      new Option('Ungrouped history', 'ungrouped'),
      ...workIds.map((id) => new Option(id, id)),
    );
    if (work === 'ungrouped' || workIds.includes(work)) workSelect.value = work;
    const selected = runSelect.value;
    const sessions = [...new Set(allOperations.map((op) => op.sessionId))];
    runSelect.replaceChildren(new Option('All runs', ''));
    for (const session of sessions) {
      const op = allOperations.find((item) => item.sessionId === session)!;
      runSelect.append(new Option(`${op.transport} · ${shortId(session)}`, session));
    }
    if (sessions.includes(selected)) runSelect.value = selected;
  }
  function renderTimeline() {
    const timeline = el('live-timeline');
    const scrollTop = timeline.scrollTop;
    const focusedId = timeline.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.operation
      : undefined;
    timeline.replaceChildren();
    if (!state.operations.length) {
      timeline.append(
        empty(
          'Nothing observed yet',
          'Actual Kiln operations will appear here. There is no agent running state to infer.',
        ),
      );
      return;
    }
    for (const operation of [...state.operations].reverse()) {
      const button = node(
        'button',
        undefined,
        `timeline-item ${operation.status}${state.selected?.operationId === operation.operationId ? ' selected' : ''}${operation.pinned ? ' pinned' : ''}`,
      );
      button.dataset.operation = operation.operationId;
      const meta = node('span', undefined, 'timeline-meta');
      meta.append(
        node('span', operation.transport.toUpperCase()),
        node('time', new Date(operation.startedAt).toLocaleTimeString()),
      );
      button.append(
        meta,
        node('strong', operation.tool.replace(/^kiln_/, '')),
        node(
          'small',
          `${operation.status} · ${operation.artifact ? 'artifact available' : 'no artifact'}`,
        ),
        node(
          'small',
          operation.workId
            ? `Item ${operation.workId}`
            : `Ungrouped · run ${shortId(operation.sessionId)}`,
        ),
      );
      button.setAttribute(
        'aria-label',
        `${operation.tool}, ${operation.status}, ${new Date(operation.startedAt).toLocaleString()}`,
      );
      if (state.selected?.operationId === operation.operationId)
        button.setAttribute('aria-current', 'true');
      button.onclick = () => {
        state = selectReviewOperation(state, operation.operationId);
        remember(selectedStorage(), operation.operationId);
        render();
      };
      timeline.append(button);
      if (focusedId === operation.operationId) button.focus({ preventScroll: true });
    }
    timeline.scrollTop = scrollTop;
  }
  function fidelityCard(operation: LiveOperation) {
    const card = node('div', undefined, 'evidence-card');
    card.append(node('h3', 'Capture fidelity'));
    const value = operation.viewFidelity;
    const fidelity =
      value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
    card.append(
      node(
        'strong',
        fidelity ? String(fidelity.delivered ?? 'Reported') : 'No capture receipt yet',
      ),
    );
    card.append(
      node(
        'p',
        fidelity?.materialFaithful === true
          ? 'Material-faithful capture reported.'
          : fidelity
            ? 'Geometry evidence only. Do not use this capture to judge materials.'
            : 'The interactive viewport uses local browser lighting; it is not a recorded capture.',
      ),
    );
    if (fidelity?.degradeReason) card.append(node('p', String(fidelity.degradeReason)));
    if (fidelity?.rendererId)
      card.append(node('p', `Renderer: ${String(fidelity.rendererId)}`, 'mono'));
    if (fidelity?.inputGlbSha256)
      card.append(node('p', `Capture input: ${String(fidelity.inputGlbSha256)}`, 'mono'));
    if (fidelity)
      card.append(
        node(
          'p',
          fidelity.exactArtifact === true
            ? 'Receipt identifies the exact evaluated artifact.'
            : 'Capture does not claim exact artifact equivalence.',
        ),
      );
    return card;
  }
  function renderEvidence() {
    const target = el('live-evidence'),
      downloads = el('live-downloads');
    target.replaceChildren();
    downloads.replaceChildren();
    const operation = state.displayed;
    if (!operation?.artifact) return;
    const identity = node('div', undefined, 'evidence-card');
    identity.append(
      node('h3', 'Selected observed artifact'),
      node('strong', `${(operation.artifact.bytes / 1024).toFixed(0)} KB GLB`),
      node('p', operation.artifact.sha256, 'mono'),
      node('p', `Source: ${operation.programRef ?? 'See authored source download'}`, 'mono'),
    );
    target.append(identity, fidelityCard(operation));
    if (operation.captures.length) {
      for (const capture of operation.captures) {
        const card = node('div', undefined, 'evidence-card');
        card.append(node('h3', capture.name));
        const fidelity =
          operation.viewFidelity && typeof operation.viewFidelity === 'object'
            ? (operation.viewFidelity as Record<string, unknown>)
            : undefined;
        card.append(
          node(
            'p',
            fidelity?.materialFaithful === true
              ? `Recorded capture · ${String(fidelity.delivered ?? 'material-faithful')}`
              : `Recorded capture · ${String(fidelity?.delivered ?? 'fidelity unreported')}. Materials are not verified.`,
            fidelity?.materialFaithful === true ? 'subtle' : 'warning',
          ),
        );
        const link = node('a'),
          img = node('img');
        img.src = capture.url;
        img.alt = `Recorded ${capture.name} for ${operation.tool}`;
        img.loading = 'lazy';
        link.href = capture.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.append(img);
        card.append(link, node('p', capture.sha256, 'mono'));
        target.append(card);
      }
    } else {
      const card = node('div', undefined, 'evidence-card');
      card.append(
        node('h3', 'Recorded captures'),
        node(
          'p',
          operation.status === 'evaluated' || operation.status === 'running'
            ? 'Artifact is ready. Capture work may still be in progress.'
            : 'No capture image was retained for this operation.',
        ),
      );
      target.append(card);
    }
    for (const [url, label, filename] of [
      [operation.artifact.url, 'Observed GLB', 'asset.glb'],
      [
        livePath(`/api/live/${encodeURIComponent(operation.operationId)}/source.kiln.js`),
        'Authored source',
        'source.kiln.js',
      ],
    ]) {
      const link = node('a', label);
      link.href = url!;
      link.download = filename!;
      downloads.append(link);
    }
    downloads.append(
      node(
        'p',
        'These are the observed artifact and source. Use the saved Library revision for an editable bundle with resources or a separate runtime export. A live observation is not a saved release.',
      ),
    );
  }
  function renderActions() {
    const visible = visibleReviewOperation(state.displayed, loadedCurrent);
    el<HTMLButtonElement>('pin-build').disabled = !visible;
    saveButton.disabled = visible?.status !== 'complete';
  }
  async function loadCurrent(operation?: LiveOperation) {
    if (el('live-panel').hidden) return;
    const ticket = ++loadGeneration;
    if (!visibleReviewOperation(operation, loadedCurrent))
      currentStage?.cancelMeasurement(
        'The review selection changed. Measure the loaded revision again.',
      );
    if (!operation?.artifact) {
      el('live-performance').replaceChildren();
      currentStage?.dispose();
      currentStage = undefined;
      loadedCurrent = undefined;
      el('live-level-field').hidden = true;
      el('live-stage-status').textContent = 'No completed artifact available for this run.';
      el('live-stage-label').textContent = 'Current';
      renderActions();
      return;
    }
    if (loadedCurrent?.artifact?.sha256 === operation.artifact.sha256) {
      loadedCurrent = operation;
      el('live-stage-status').textContent = '';
      el('live-stage-label').textContent = `Observed · ${shortId(operation.operationId)}`;
      renderActions();
      return;
    }
    el('live-stage-status').textContent =
      `Loading ${shortId(operation.operationId)}…${loadedCurrent ? ` Previous artifact ${shortId(loadedCurrent.operationId)} remains visible; Save and Pin are unavailable until the selection loads.` : ''}`;
    try {
      const response = await fetch(operation.artifact.url);
      if (!response.ok) throw new Error('This retained artifact is no longer available');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (ticket !== loadGeneration) return;
      currentStage ??= createAssetStage(el('live-stage'));
      const result = await currentStage.load(bytes, {
        isCurrent: () => ticket === loadGeneration,
        onCommit: () => {
          loadedCurrent = operation;
        },
        preserveView:
          loadedCurrent?.projectId === operation.projectId &&
          (loadedCurrent?.sessionId === operation.sessionId || state.following),
      });
      if (!result || ticket !== loadGeneration) return;
      el('live-performance').replaceChildren();
      loadedCurrent = operation;
      renderActions();
      // MSFT_lod chains open at LOD0, or at the level already chosen when this build has it.
      const levelSelect = el<HTMLSelectElement>('live-level');
      const chosen = Number(levelSelect.value || 0);
      levelSelect.replaceChildren(
        ...levelLabels(result.levels ?? []).map((label, i) => new Option(label, String(i))),
      );
      el('live-level-field').hidden = !result.levels;
      const level = result.levels && chosen < result.levels.length ? chosen : 0;
      levelSelect.value = String(level);
      currentStage.level(level);
      comparisonStage?.level(level);
      currentStage.wire(wire);
      currentStage.navigation(el<HTMLSelectElement>('live-navigation').value);
      el('live-stage-status').textContent = '';
      el('live-stage-label').textContent =
        `${result.levels ? describeLevels(result.levels) : `${result.triangles.toLocaleString()} triangles`} · ${result.meshes} meshes · ${shortId(operation.operationId)}`;
      if (comparisonStage) comparisonStage.setView(currentStage.view());
    } catch (error) {
      if (ticket !== loadGeneration) return;
      el('live-stage-status').textContent =
        `${error instanceof Error ? error.message : error}.${loadedCurrent ? ` Previous artifact ${shortId(loadedCurrent.operationId)} remains visible. Save and Pin are unavailable for the unloaded selection.` : ''}`;
      renderActions();
    }
  }
  async function loadComparison(operation?: LiveOperation) {
    if (el('live-panel').hidden) return;
    const ticket = ++compareGeneration;
    el('compare-viewport').hidden = !operation?.artifact;
    el('review-viewports').classList.toggle('comparing', !!operation?.artifact);
    if (!operation?.artifact) {
      comparisonStage?.dispose();
      comparisonStage = undefined;
      loadedComparison = undefined;
      return;
    }
    if (loadedComparison?.artifact?.sha256 === operation.artifact.sha256) {
      loadedComparison = operation;
      el('compare-stage-label').textContent = `Pinned · ${shortId(operation.operationId)}`;
      el('compare-stage-status').textContent = '';
      return;
    }
    if (!loadedComparison) el('compare-stage-label').textContent = 'Comparison';
    el('compare-stage-status').textContent = `Loading pinned ${shortId(operation.operationId)}…`;
    try {
      const response = await fetch(operation.artifact.url);
      if (!response.ok) throw new Error('Pinned artifact unavailable');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (ticket !== compareGeneration) return;
      comparisonStage ??= createAssetStage(el('compare-stage'));
      const result = await comparisonStage.load(bytes, {
        preserveView: true,
        isCurrent: () => ticket === compareGeneration,
        onCommit: () => {
          loadedComparison = operation;
        },
      });
      if (!result || ticket !== compareGeneration) return;
      loadedComparison = operation;
      el('compare-stage-label').textContent = `Pinned · ${shortId(operation.operationId)}`;
      if (currentStage) comparisonStage.setView(currentStage.view());
      comparisonStage.level(Number(el<HTMLSelectElement>('live-level').value || 0));
      comparisonStage.wire(wire);
      comparisonStage.navigation(el<HTMLSelectElement>('live-navigation').value);
      el('compare-stage-status').textContent = '';
    } catch (error) {
      if (ticket === compareGeneration)
        el('compare-stage-status').textContent =
          `${error instanceof Error ? error.message : String(error)}.${loadedComparison ? ` Previous comparison ${shortId(loadedComparison.operationId)} remains visible.` : ''}`;
    }
  }
  function render() {
    renderTimeline();
    const selected = state.selected,
      displayed = state.displayed;
    const follow = el('follow-latest');
    follow.textContent = state.following ? 'Following latest' : 'Follow latest';
    follow.setAttribute('aria-pressed', String(state.following));
    const summary = el('live-current-summary');
    summary.replaceChildren();
    if (selected) {
      summary.append(
        node('h2', selected.tool.replace(/^kiln_/, '')),
        node(
          'p',
          `${selected.status} · ${selected.transport} · Run ${shortId(selected.sessionId)} · ${new Date(selected.updatedAt).toLocaleString()}`,
        ),
      );
      const tags = node('div', undefined, 'tags');
      if (selected.projectId) tags.append(node('span', selected.projectId, 'tag'));
      for (const phase of selected.phases) tags.append(node('span', phase.phase, 'tag'));
      summary.append(tags);
    } else
      summary.append(
        node('h2', 'No build selected'),
        node(
          'p',
          'Run Kiln tools from your agent or CLI. Completed evaluations appear here automatically.',
        ),
      );
    const issues =
      selected && 'observationIssues' in selected && Array.isArray(selected.observationIssues)
        ? selected.observationIssues.map(String)
        : [];
    const warnings = [
      selected?.error,
      ...issues,
      selected && displayed && selected.operationId !== displayed.operationId
        ? `Current ${selected.status} operation has no retained artifact. Showing the last successful artifact ${shortId(displayed.operationId)} from run ${shortId(displayed.sessionId)}.`
        : '',
      selected && !state.operations.some((op) => op.operationId === selected.operationId)
        ? 'This selection is outside the current retained history. Its loaded view remains until you choose another build.'
        : '',
    ].filter(Boolean);
    el('live-failure').textContent = warnings.join(' ');
    el('live-failure').hidden = !warnings.length;
    renderActions();
    el('clear-pin').hidden = !state.pinned;
    el('live-count').textContent =
      `${state.operations.length} retained operation${state.operations.length === 1 ? '' : 's'}`;
    el('live-record').textContent = JSON.stringify(
      {
        selected,
        displayedArtifactOperation: displayed?.operationId,
        pinnedOperation: state.pinned?.operationId,
      },
      null,
      2,
    );
    renderEvidence();
    void loadCurrent(displayed);
    void loadComparison(state.pinned);
  }
  async function refresh() {
    if (pending) return;
    pending = true;
    const ticket = generation;
    try {
      const params = new URLSearchParams();
      if (projectSelect.value) params.set('project', projectSelect.value);
      if (cursor) params.set('cursor', cursor);
      const snapshot = await request<LiveSnapshot>(livePath(`/api/live?${params}`));
      if (ticket !== generation) return;
      failures = 0;
      connected(true, 'Connected · checks every 2 seconds');
      cursor = snapshot.cursor;
      el('live-history-note').textContent = `Up to ${snapshot.retention.maxOperations} operations`;
      el('live-history-issues').textContent = snapshot.observationIssues?.join(' ') ?? '';
      el('live-history-issues').hidden = !snapshot.observationIssues?.length;
      if (!snapshot.unchanged) {
        allOperations = snapshot.operations;
        renderRuns();
        state = reconcileReview(state, visibleOperations());
        if (!recoveredPreference) {
          recoveredPreference = true;
          const savedSelection = recall(selectedStorage());
          if (savedSelection && state.operations.some((op) => op.operationId === savedSelection))
            state = selectReviewOperation(state, savedSelection);
          const savedPin = recall(pinStorage());
          state.pinned =
            allOperations.find((op) => op.operationId === savedPin && op.pinned) ??
            [...allOperations].reverse().find((op) => op.pinned && op.artifact);
        }
        render();
      }
    } catch (error) {
      failures++;
      connected(
        false,
        `Connection lost. Retrying; retained views remain available. ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      pending = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => void refresh(),
        document.hidden ? 10000 : Math.min(30000, 2000 * 2 ** Math.min(failures, 4)),
      );
    }
  }
  projectSelect.onchange = () => {
    generation++;
    cursor = '';
    allOperations = [];
    recoveredPreference = false;
    runSelect.replaceChildren(new Option('All runs', ''));
    workSelect.value = '';
    state = { following: true, crossRunContinuity: true, operations: [] };
    render();
    void refresh();
  };
  sourceSelect.onchange = () => {
    projectSelect.value = '';
    state.pinned = undefined;
    projectSelect.dispatchEvent(new Event('change'));
  };
  void request<{ sources: { id: string; label: string }[] }>('/api/live-sources')
    .then(({ sources }) => {
      sourceSelect.replaceChildren(...sources.map((source) => new Option(source.label, source.id)));
    })
    .catch(notice);
  runSelect.onchange = () => {
    state = reconcileReview(
      {
        ...state,
        selected: undefined,
        displayed: undefined,
        following: true,
        crossRunContinuity: !runSelect.value,
      },
      visibleOperations(),
    );
    render();
  };
  workSelect.onchange = () => runSelect.dispatchEvent(new Event('change'));
  el('follow-latest').onclick = () => {
    state = reconcileReview({ ...state, following: !state.following }, visibleOperations());
    remember(selectedStorage(), state.following ? '' : (state.selected?.operationId ?? ''));
    render();
  };
  el('live-refresh').onclick = () => {
    cursor = '';
    void refresh();
    render();
  };
  el('pin-build').onclick = async () => {
    const operation = visibleReviewOperation(state.displayed, loadedCurrent);
    if (!operation?.artifact) return;
    const button = el<HTMLButtonElement>('pin-build');
    button.disabled = true;
    try {
      await request(livePath(`/api/live/${encodeURIComponent(operation.operationId)}/pin`), {
        method: 'POST',
        body: { pinned: true },
      });
      state.pinned = { ...operation, pinned: true };
      remember(pinStorage(), operation.operationId);
      cursor = '';
      render();
      void refresh();
    } catch (error) {
      notice(error);
      renderActions();
    }
  };
  el('clear-pin').onclick = async () => {
    if (!state.pinned) return;
    try {
      await request(livePath(`/api/live/${encodeURIComponent(state.pinned.operationId)}/pin`), {
        method: 'POST',
        body: { pinned: false },
      });
      state.pinned = undefined;
      remember(pinStorage(), '');
      cursor = '';
      render();
      void refresh();
    } catch (error) {
      notice(error);
    }
  };
  el('live-frame').onclick = () => {
    currentStage?.reset();
    if (currentStage) comparisonStage?.setView(currentStage.view());
  };
  el<HTMLSelectElement>('live-level').onchange = (event) => {
    const level = Number((event.target as HTMLSelectElement).value);
    currentStage?.level(level);
    comparisonStage?.level(level);
  };
  el('live-wire').onclick = () => {
    wire = !wire;
    currentStage?.wire(wire);
    comparisonStage?.wire(wire);
    el('live-wire').setAttribute('aria-pressed', String(wire));
  };
  const match = node('button', 'Match comparison camera', 'secondary');
  match.onclick = () => {
    if (currentStage) comparisonStage?.setView(currentStage.view());
  };
  el('live-frame').parentElement?.append(match);
  const saveButton = node('button', 'Save exact artifact');
  saveButton.disabled = true;
  el('live-frame').parentElement?.prepend(saveButton);
  const measureButton = node('button', 'Measure 3 s', 'secondary');
  const measurements = node('div');
  measurements.id = 'live-performance';
  el('live-evidence').after(measurements);
  el('live-frame').parentElement?.append(measureButton);
  mountPerformanceControl(
    measureButton,
    measurements,
    () => currentStage,
    () =>
      visibleReviewOperation(state.displayed, loadedCurrent)
        ? {
            operationId: loadedCurrent!.operationId,
            revision: loadedCurrent!.revision,
            glbSha256: loadedCurrent!.artifact?.sha256,
          }
        : undefined,
  );
  saveButton.onclick = () => {
    const operation = visibleReviewOperation(state.displayed, loadedCurrent);
    if (operation?.status !== 'complete') return;
    const dialog = node('dialog'),
      form = node('form'),
      content = node('div', undefined, 'editor-content');
    const title = node('h2', 'Save reviewed artifact');
    title.id = 'save-review-title';
    dialog.setAttribute('aria-labelledby', title.id);
    content.append(
      title,
      node(
        'p',
        'Save the exact source, GLB and recorded capture to Library. Then optionally link the saved revision to one or more named projects. Kiln will not evaluate the source again.',
        'subtle',
      ),
      node('p', `${operation.operationId} · revision ${operation.revision}`, 'mono'),
      node('p', operation.artifact!.sha256, 'mono'),
    );
    const name = node('input');
    name.required = true;
    name.maxLength = 200;
    name.value = '';
    const label = node('label', 'Asset name', 'field');
    label.append(name);
    const status = node('p');
    status.setAttribute('role', 'status');
    const submit = node('button', 'Save exact artifact');
    submit.type = 'submit';
    const close = node('button', 'Cancel', 'secondary');
    close.type = 'button';
    close.onclick = () => dialog.close();
    content.append(label, status, submit, close);
    form.append(content);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      status.textContent = 'Saving retained bytes…';
      try {
        const input = reviewedSaveRequest(operation, name.value, loadedCurrent, state.displayed);
        const saved = await request<{ ok: boolean; collection: string; asset: AssetManifest }>(
          livePath(input.path),
          { method: 'POST', body: input.body },
        );
        status.replaceChildren(
          node('span', `Saved ${saved.asset.assetId} / ${saved.asset.revisionId}. `),
        );
        const link = node('a', 'Open saved revision');
        const params = new URLSearchParams({
          collection: saved.collection,
          asset: saved.asset.assetId,
          revision: saved.asset.revisionId,
        });
        link.href = `/?${params}`;
        status.append(link);
        const membership = node('div');
        content.append(membership);
        void mountMembership(
          membership,
          {
            collectionId: saved.collection,
            assetId: saved.asset.assetId,
            revisionId: saved.asset.revisionId,
          },
          saved.asset.name,
          async () => {},
        ).catch((error) => {
          membership.textContent = `Asset saved; membership unavailable: ${error instanceof Error ? error.message : error}. Open the saved asset in Library to link it.`;
        });
        name.disabled = true;
        submit.textContent = 'Saved';
        close.textContent = 'Close';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
        submit.disabled = false;
      }
    };
    dialog.showModal();
    name.focus();
  };
  el<HTMLSelectElement>('live-navigation').onchange = (event) => {
    const value = (event.target as HTMLSelectElement).value;
    currentStage?.navigation(value);
    comparisonStage?.navigation(value);
    el('live-navigation-help').textContent =
      value === 'explore'
        ? 'Focus a viewport, then W A S D to move · Q / E down / up · Shift faster · Drag to look around · No collision simulation.'
        : 'Drag to orbit · Scroll to zoom · Right-drag to pan · Your camera stays in place between iterations.';
  };
  window.addEventListener('online', () => {
    cursor = '';
    void refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  void refresh();
  return {
    activate: render,
    projects(projects: ProjectRevision[]) {
      const selected = projectSelect.value;
      projectSelect.replaceChildren(new Option('All work', ''));
      for (const project of projects)
        projectSelect.append(new Option(project.name, project.projectId));
      if (projects.some((p) => p.projectId === selected)) projectSelect.value = selected;
    },
  };
}
