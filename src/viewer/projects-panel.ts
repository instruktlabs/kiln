/// <reference lib="dom" />
import type { ProjectRevision } from '../projects';
import { editableProjectConfig, projectFormDraft } from './project-editor';
import { el, node, notice, request, empty, remember, recall, shortId, recordDetails } from './dom';

type AssetLink = NonNullable<ProjectRevision['inventory'][number]['asset']>;

export function mountProjects(options: {
  changed(projects: ProjectRevision[]): void;
  openAsset(asset: AssetLink): void;
}) {
  let projects: ProjectRevision[] = [];
  let chosenId = recall('kiln.project') ?? '';
  let editing: ProjectRevision | undefined;
  const render = () => {
    const list = el('project-list');
    list.replaceChildren();
    for (const project of projects) {
      const button = node('button', undefined, project.projectId === chosenId ? 'active' : '');
      button.append(
        node('strong', project.name),
        node(
          'small',
          `${project.inventory.length} inventory items · ${project.materialDependencies.length} resources`,
        ),
      );
      if (project.projectId === chosenId) button.setAttribute('aria-current', 'true');
      button.onclick = () => {
        chosenId = project.projectId;
        remember('kiln.project', chosenId);
        render();
      };
      list.append(button);
    }
    const project = projects.find((item) => item.projectId === chosenId);
    const detail = el('project-detail');
    detail.replaceChildren();
    if (!project) {
      detail.append(
        empty(
          'A direction for what comes next.',
          'Projects are optional. Group related assets, materials and design decisions here, or build and review standalone assets in Library and Live Review.',
        ),
      );
      return;
    }
    const heading = node('div', undefined, 'project-summary');
    const title = node('div');
    title.append(
      node('h2', project.name),
      node('p', project.brief || 'Add a brief to describe what this project should deliver.'),
    );
    const edit = node('button', 'Edit project', 'secondary');
    edit.onclick = () => openEditor(project);
    heading.append(title, edit);
    detail.append(heading);
    const identity = node(
      'p',
      `${project.projectId} · ${shortId(project.revisionId)} · ${new Date(project.createdAt).toLocaleString()}`,
      'mono',
    );
    detail.append(identity);
    const metrics = node('div', undefined, 'project-metrics');
    for (const [value, label] of [
      [project.inventory.length, 'inventory items'],
      [project.materialDependencies.length, 'locked resources'],
      [project.deliveryProfiles.length, 'delivery profiles'],
    ]) {
      const metric = node('div');
      metric.append(node('strong', String(value)), node('span', String(label)));
      metrics.append(metric);
    }
    detail.append(metrics);
    const profile = node('div', undefined, 'profile-grid');
    for (const [label, value] of [
      ['Visual direction', project.design.style || 'Not specified'],
      ['Scale', project.design.scale || 'Not specified'],
    ]) {
      const field = node('div');
      field.append(node('span', label, 'label'), node('p', value));
      profile.append(field);
    }
    detail.append(profile);
    const palette = node('div', undefined, 'palette');
    for (const item of project.design.palette) {
      const swatch = node('div', undefined, 'swatch');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', '24');
      rect.setAttribute('height', '24');
      rect.setAttribute('fill', item.color);
      svg.append(rect);
      const caption = node('span', item.role);
      caption.append(node('small', item.color));
      swatch.append(svg, caption);
      palette.append(swatch);
    }
    if (palette.childElementCount) detail.append(palette);
    for (const [label, values] of [
      ['Conventions', project.design.conventions],
      ['Declared exceptions', project.design.exceptions],
    ] as const) {
      if (!values.length) continue;
      detail.append(node('h3', label));
      const items = node('ul', undefined, 'subtle');
      for (const value of values) items.append(node('li', value));
      detail.append(items);
    }
    detail.append(node('h3', 'Inventory'));
    if (!project.inventory.length)
      detail.append(
        node(
          'p',
          'No inventory yet. Add deliberate asset and environment entries in the project configuration.',
          'subtle',
        ),
      );
    else {
      const wrap = node('div', undefined, 'table-wrap'),
        table = node('table'),
        head = node('thead'),
        tr = node('tr');
      for (const label of ['Item', 'Kind', 'Saved revision', 'Review'])
        tr.append(node('th', label));
      head.append(tr);
      table.append(head);
      const body = node('tbody');
      for (const item of project.inventory) {
        const row = node('tr'),
          name = node('td', item.name);
        name.append(node('small', item.brief));
        const saved = node('td'),
          review = node('td');
        if (item.asset) {
          const link = node('button', shortId(item.asset.revisionId), 'secondary');
          link.onclick = () => options.openAsset(item.asset!);
          saved.append(link);
          const latest = [...project.reviews]
            .reverse()
            .find(
              (r) =>
                r.inventoryId === item.id &&
                r.asset.revisionId === item.asset!.revisionId &&
                r.asset.assetId === item.asset!.assetId &&
                r.asset.collectionId === item.asset!.collectionId,
            );
          review.append(
            node('small', latest ? `${latest.verdict} · ${latest.reviewer}` : 'Unreviewed'),
          );
          const button = node('button', 'Record review', 'secondary');
          button.onclick = () => reviewItem(project, item);
          review.append(button);
        } else {
          saved.textContent = 'Not linked';
          review.textContent = 'No saved revision';
        }
        row.append(name, node('td', item.kind), saved, review);
        body.append(row);
      }
      table.append(body);
      wrap.append(table);
      detail.append(wrap);
    }
    if (project.design.materialRoles.length) {
      detail.append(node('h3', 'Material roles'));
      for (const role of project.design.materialRoles)
        detail.append(
          node(
            'p',
            `${role.role}: ${role.description || 'No description'}${role.resourceId ? ` · ${role.resourceId}` : ' · No resource assigned'}`,
            'subtle',
          ),
        );
    }
    if (project.deliveryProfiles.length) {
      detail.append(node('h3', 'Delivery intent'));
      for (const target of project.deliveryProfiles) {
        detail.append(node('p', `${target.target} · ${target.description || target.id}`, 'subtle'));
        if (target.performanceIntent) detail.append(node('p', target.performanceIntent, 'subtle'));
        for (const constraint of target.constraints) detail.append(node('p', constraint, 'subtle'));
      }
      detail.append(
        node(
          'p',
          'Declared targets are project intent. They do not establish consumer or performance qualification.',
          'subtle',
        ),
      );
    }
    if (project.references.length) {
      detail.append(node('h3', 'Reference records'));
      for (const ref of project.references) {
        const p = node('p', `${ref.title}: ${ref.uri}`, 'subtle');
        if (ref.description) p.append(node('small', ` · ${ref.description}`));
        detail.append(p);
      }
    }
    detail.append(node('h3', 'Project downloads'));
    const downloads = node('div', undefined, 'downloads');
    for (const profile of ['editable', 'runtime'] as const) {
      const link = node(
        'a',
        profile === 'editable'
          ? 'Download editable project bundle'
          : 'Download runtime project bundle',
      );
      const params = new URLSearchParams({ profile, revision: project.revisionId });
      link.href = `/api/projects/${encodeURIComponent(project.projectId)}/bundle?${params}`;
      link.download = `${project.projectId}-${profile}.zip`;
      downloads.append(link);
    }
    downloads.append(
      node(
        'p',
        'Both downloads bind this exact project revision and its linked saved inventory. Editable includes authored source and material resources for rebuilding. Runtime is delivery-only and cannot restore editable source. Unlinked inventory entries remain plans, not bundled assets.',
      ),
    );
    detail.append(downloads);
    detail.append(recordDetails('Exact project configuration and review records', project));
  };

  const refresh = async () => {
    const result = await request<{ projects: ProjectRevision[] }>('/api/projects');
    if (
      projects.length === result.projects.length &&
      projects.every((project, index) => project.revisionId === result.projects[index]?.revisionId)
    )
      return;
    projects = result.projects;
    if (!projects.some((p) => p.projectId === chosenId)) chosenId = projects[0]?.projectId ?? '';
    render();
    options.changed(projects);
  };

  function openEditor(project?: ProjectRevision) {
    editing = project;
    el('project-editor-title').textContent = project ? 'Edit project' : 'New project';
    el<HTMLInputElement>('project-name').value = project?.name ?? '';
    el<HTMLTextAreaElement>('project-brief').value = project?.brief ?? '';
    el<HTMLTextAreaElement>('project-style').value = project?.design.style ?? '';
    el<HTMLInputElement>('project-scale').value = project?.design.scale ?? '';
    el<HTMLTextAreaElement>('project-config').value = JSON.stringify(
      editableProjectConfig(project ?? { name: '' }),
      null,
      2,
    );
    el('project-save-status').textContent = '';
    el<HTMLDialogElement>('project-editor').showModal();
    el('project-name').focus();
  }

  function reviewItem(project: ProjectRevision, item: ProjectRevision['inventory'][number]) {
    if (!item.asset) return;
    const dialog = node('dialog'),
      form = node('form'),
      content = node('div', undefined, 'editor-content');
    const title = node('h2', `Review ${item.name}`);
    title.id = 'review-dialog-title';
    dialog.setAttribute('aria-labelledby', title.id);
    content.append(
      title,
      node(
        'p',
        'Record an assessment of this exact saved revision. This is a review annotation; structural QA and release qualification remain separate.',
        'subtle',
      ),
      node('code', `${item.asset.assetId} / ${item.asset.revisionId}`, 'mono'),
    );
    const reviewer = node('input');
    reviewer.required = true;
    reviewer.value = recall('kiln.reviewer') ?? '';
    reviewer.maxLength = 200;
    const who = node('label', 'Reviewer', 'field');
    who.append(reviewer);
    const verdict = node('select');
    for (const [id, label] of [
      ['comment', 'Comment'],
      ['changes-requested', 'Changes requested'],
      ['accepted', 'Visually accepted'],
    ])
      verdict.append(new Option(label, id));
    const what = node('label', 'Assessment', 'field');
    what.append(verdict);
    const notes = node('textarea');
    notes.rows = 4;
    notes.maxLength = 4000;
    const why = node('label', 'Notes', 'field');
    why.append(notes);
    const status = node('p');
    status.setAttribute('role', 'status');
    const save = node('button', 'Save review');
    save.type = 'submit';
    const cancel = node('button', 'Cancel', 'secondary');
    cancel.type = 'button';
    cancel.onclick = () => dialog.close();
    content.append(who, what, why, status, save, cancel);
    form.append(content);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      status.textContent = 'Saving review…';
      try {
        await request(`/api/projects/${encodeURIComponent(project.projectId)}`, {
          method: 'PATCH',
          body: {
            expectedRevision: project.revisionId,
            patch: {
              reviews: [
                ...project.reviews,
                {
                  id: `review_${crypto.randomUUID().replaceAll('-', '')}`,
                  inventoryId: item.id,
                  projectRevisionId: project.revisionId,
                  asset: item.asset,
                  reviewer: reviewer.value.trim(),
                  verdict: verdict.value,
                  notes: notes.value,
                },
              ],
            },
          },
        });
        remember('kiln.reviewer', reviewer.value.trim());
        dialog.close();
        await refresh();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        save.disabled = false;
      }
    };
    dialog.showModal();
    reviewer.focus();
  }

  el('new-project').onclick = () => openEditor();
  el('close-project-editor').onclick = () => el<HTMLDialogElement>('project-editor').close();
  el<HTMLFormElement>('project-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = el<HTMLButtonElement>('save-project');
    button.disabled = true;
    el('project-save-status').textContent = 'Saving revision…';
    try {
      const draft = projectFormDraft(el<HTMLTextAreaElement>('project-config').value, {
        name: el<HTMLInputElement>('project-name').value,
        brief: el<HTMLTextAreaElement>('project-brief').value,
        style: el<HTMLTextAreaElement>('project-style').value,
        scale: el<HTMLInputElement>('project-scale').value,
      });
      const project = await request<ProjectRevision>(
        editing ? `/api/projects/${encodeURIComponent(editing.projectId)}` : '/api/projects',
        editing
          ? { method: 'PATCH', body: { expectedRevision: editing.revisionId, patch: draft } }
          : { method: 'POST', body: draft },
      );
      chosenId = project.projectId;
      remember('kiln.project', chosenId);
      el<HTMLDialogElement>('project-editor').close();
      notice('Project revision saved.');
      await refresh();
    } catch (error) {
      el('project-save-status').textContent =
        error instanceof Error ? error.message : String(error);
    } finally {
      button.disabled = false;
    }
  };
  return { refresh };
}
