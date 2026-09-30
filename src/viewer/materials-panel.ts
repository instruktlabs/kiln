/// <reference lib="dom" />
import type { MaterialManifestV1 } from '../material-library';
import type { MaterialPresetSummary } from '../material-presets';
import type { ProjectRevision } from '../projects';
import { el, node, request, notice, empty, recordDetails } from './dom';
import { materialPresetRequest } from './material-preset-form';

export function mountMaterials(updated: () => Promise<void>) {
  let materials: MaterialManifestV1[] = [];
  let projects: ProjectRevision[] = [];
  let presets: MaterialPresetSummary[] = [];
  const projectSelect = el<HTMLSelectElement>('materials-project');
  const createButton = node('button', 'Create from preset');
  el('materials-refresh').before(createButton);
  const dialog = node('dialog');
  dialog.setAttribute('aria-labelledby', 'material-preset-heading');
  const form = node('form');
  const top = node('div', undefined, 'detail-top');
  const heading = node('h2', 'Create a material resource');
  heading.id = 'material-preset-heading';
  const cancel = node('button', 'Cancel', 'secondary');
  cancel.type = 'button';
  cancel.onclick = () => dialog.close();
  top.append(heading, cancel);
  const content = node('div', undefined, 'editor-content');
  content.append(
    node(
      'p',
      'Offline starting recipes with editable layers and height-derived normals. Choose an explicit seed and provenance for the resource. Map images are not shaded material previews.',
      'subtle',
    ),
  );
  function field<T extends HTMLElement>(label: string, input: T) {
    const wrapper = node('label', label, 'field');
    wrapper.append(input);
    content.append(wrapper);
    return input;
  }
  const preset = field('Preset', node('select'));
  const description = node('p', undefined, 'subtle');
  content.append(description);
  const seed = field('Seed', node('input'));
  seed.type = 'number';
  seed.step = '1';
  seed.required = true;
  seed.min = '-2147483648';
  seed.max = '2147483647';
  seed.value = '0';
  const size = field('Map size', node('select'));
  for (const value of [64, 128, 256, 512])
    size.append(new Option(`${value} × ${value}`, String(value)));
  size.value = '256';
  const creator = field('Creator', node('input'));
  creator.required = true;
  creator.maxLength = 1000;
  const spdx = field('License identifier', node('input'));
  spdx.required = true;
  spdx.placeholder = 'For example, CC0-1.0';
  const url = field('License URL', node('input'));
  url.type = 'url';
  url.required = true;
  const attribution = field('Attribution text', node('textarea'));
  attribution.rows = 2;
  const status = node('p');
  status.setAttribute('role', 'status');
  const submit = node('button', 'Create resource');
  submit.type = 'submit';
  content.append(status, submit);
  form.append(top, content);
  dialog.append(form);
  document.body.append(dialog);
  const describe = () => {
    const item = presets.find((p) => p.id === preset.value);
    description.textContent = item
      ? `${item.description} Repeat scale: ${item.physicalSizeMeters.width} × ${item.physicalSizeMeters.height} m.`
      : '';
  };
  preset.onchange = describe;
  createButton.onclick = async () => {
    createButton.disabled = true;
    try {
      presets = (await request<{ presets: MaterialPresetSummary[] }>('/api/material-presets'))
        .presets;
      preset.replaceChildren(...presets.map((p) => new Option(p.name, p.id)));
      describe();
      status.textContent = '';
      submit.disabled = !presets.length;
      dialog.showModal();
    } catch (error) {
      notice(error);
    } finally {
      createButton.disabled = false;
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = 'Creating immutable material resource…';
    try {
      const body = materialPresetRequest({
        presetId: preset.value,
        seed: seed.value,
        size: size.value,
        creator: creator.value,
        spdx: spdx.value,
        url: url.value,
        attribution: attribution.value,
      });
      const result = await request<{ material: MaterialManifestV1 }>('/api/materials/preset', {
        method: 'POST',
        body,
      });
      await refresh();
      dialog.close();
      notice(
        `${result.material.name} created at ${result.material.revisionId}. Ready for standalone assets. You can also lock this revision to an optional project.`,
      );
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      submit.disabled = false;
    }
  };
  const base = (material: MaterialManifestV1) =>
    `/api/materials/${encodeURIComponent(material.materialId)}/${encodeURIComponent(material.revisionId)}`;
  function render() {
    const project = projects.find((p) => p.projectId === projectSelect.value);
    const dependencies = el('material-dependencies');
    dependencies.replaceChildren();
    if (project) {
      dependencies.append(node('h2', `${project.name}: locked resources`));
      if (!project.materialDependencies.length)
        dependencies.append(
          node(
            'p',
            'No materials are locked to this project yet. Select a resource revision below or configure dependencies with your agent.',
            'subtle',
          ),
        );
      else {
        const table = node('table'),
          head = node('thead'),
          headers = node('tr'),
          body = node('tbody');
        for (const label of ['Resource / role', 'Exact revision', 'Local availability'])
          headers.append(node('th', label));
        head.append(headers);
        table.append(head);
        for (const dep of project.materialDependencies) {
          const local = materials.find(
            (m) => m.materialId === dep.resourceId && m.revisionId === dep.revisionId,
          );
          const row = node('tr'),
            label = node('td', dep.resourceId);
          label.append(
            node(
              'small',
              dep.role ??
                project.design.materialRoles
                  .filter((r) => r.resourceId === dep.resourceId)
                  .map((r) => r.role)
                  .join(', '),
            ),
          );
          row.append(
            label,
            node('td', dep.revisionId, 'mono'),
            node(
              'td',
              local && local.revisionId === dep.sha256
                ? 'Exact local record available'
                : local
                  ? 'Dependency hash differs'
                  : 'Not in local catalog',
            ),
          );
          body.append(row);
        }
        table.append(body);
        const wrap = node('div', undefined, 'table-wrap');
        wrap.append(table);
        dependencies.append(wrap);
      }
    }
    const list = el('material-list');
    list.replaceChildren();
    const query = el<HTMLInputElement>('material-search').value.trim().toLowerCase();
    const shown = materials.filter((m) =>
      `${m.name} ${m.materialId} ${m.tags.join(' ')} ${m.sources.map((s) => s.provider).join(' ')}`
        .toLowerCase()
        .includes(query),
    );
    el('material-count').textContent =
      `${shown.length} material revision${shown.length === 1 ? '' : 's'}`;
    if (!shown.length) {
      list.append(
        empty(
          query ? 'No matching materials' : 'Your material catalog starts here',
          query
            ? 'Try another material name, tag or provider.'
            : 'Materials added through Kiln appear here with their map roles, source records and exact revisions.',
        ),
      );
      return;
    }
    for (const material of shown) {
      const card = node('article', undefined, 'material-card');
      const preview = material.maps.find((m) => m.slot === 'baseColor') ?? material.maps[0];
      if (preview) {
        const image = node('img');
        image.src = `${base(material)}/${encodeURIComponent(preview.file)}`;
        image.alt = `${material.name}: ${preview.slot} map, not a shaded material preview`;
        image.loading = 'lazy';
        image.className = 'material-map';
        card.append(image, node('p', `${preview.slot} map · unshaded`, 'subtle'));
      }
      card.append(node('h3', material.name), node('p', material.tags.join(' · '), 'subtle'));
      const facts = node('dl');
      const add = (label: string, value: string) =>
        facts.append(node('dt', label), node('dd', value));
      add('Revision', material.revisionId);
      add(
        'Physical scale',
        material.physicalSizeMeters
          ? `${material.physicalSizeMeters.width} × ${material.physicalSizeMeters.height} m`
          : 'Not specified',
      );
      add('Tiling', material.tileable ? 'Declared tileable' : 'Not declared tileable');
      add(
        'Maps',
        material.maps
          .map((map) => `${map.slot} ${map.width}×${map.height} (${map.colorSpace})`)
          .join(' · '),
      );
      add(
        'Surface factors',
        `Roughness ×${material.parameters.roughness} · Metalness ×${material.parameters.metalness}${material.maps.some((map) => map.slot === 'metallicRoughness') ? ' · multiplied by packed map channels' : ''}`,
      );
      card.append(facts);
      for (const source of material.sources) {
        const provenance = node(
          'p',
          `${source.provider} · ${source.creator} · ${source.kind}`,
          'subtle',
        );
        const license = node('a', source.license.spdx);
        license.href = source.license.url;
        license.target = '_blank';
        license.rel = 'noreferrer';
        provenance.append(document.createTextNode(' · '), license);
        if (source.assetUrl) {
          const sourceLink = node('a', 'Source');
          sourceLink.href = source.assetUrl;
          sourceLink.target = '_blank';
          sourceLink.rel = 'noreferrer';
          provenance.append(document.createTextNode(' · '), sourceLink);
        }
        card.append(provenance);
        if (source.license.attribution)
          card.append(node('p', source.license.attribution, 'subtle'));
      }
      const maps = node('div', undefined, 'material-map-links');
      for (const map of material.maps) {
        const link = node('a', map.slot);
        link.href = `${base(material)}/${encodeURIComponent(map.file)}`;
        link.target = '_blank';
        link.rel = 'noopener';
        maps.append(link);
      }
      card.append(maps);
      const locked = project?.materialDependencies.find(
        (d) => d.resourceId === material.materialId,
      );
      const pin = node(
        'button',
        locked?.revisionId === material.revisionId
          ? 'Locked to project'
          : locked
            ? 'Use this revision'
            : 'Add to project',
        'secondary',
      );
      pin.disabled = !project || locked?.revisionId === material.revisionId;
      if (!project) pin.title = 'Select a project to add a material dependency';
      pin.onclick = async () => {
        if (!project) return;
        pin.disabled = true;
        try {
          const deps = project.materialDependencies.filter(
            (dep) => dep.resourceId !== material.materialId,
          );
          deps.push({
            resourceId: material.materialId,
            revisionId: material.revisionId,
            sha256: material.revisionId,
            ...(locked?.role ? { role: locked.role } : {}),
          });
          await request(`/api/projects/${encodeURIComponent(project.projectId)}`, {
            method: 'PATCH',
            body: {
              expectedRevision: project.revisionId,
              patch: { materialDependencies: deps },
            },
          });
          notice(`${material.name} is locked to ${project.name} at this exact revision.`);
          await updated();
        } catch (error) {
          notice(error);
          pin.disabled = false;
        }
      };
      card.append(pin, recordDetails('Map recipes, transformations and provenance', material));
      list.append(card);
    }
  }
  const refresh = async () => {
    materials = (await request<{ materials: MaterialManifestV1[] }>('/api/materials')).materials;
    render();
  };
  el('material-search').oninput = render;
  projectSelect.onchange = render;
  el('materials-refresh').onclick = () => void refresh().catch(notice);
  return {
    refresh,
    projects(value: ProjectRevision[]) {
      projects = value;
      const selected = projectSelect.value;
      projectSelect.replaceChildren(new Option('All materials', ''));
      for (const project of projects)
        projectSelect.append(new Option(project.name, project.projectId));
      if (projects.some((p) => p.projectId === selected)) projectSelect.value = selected;
      render();
    },
  };
}
