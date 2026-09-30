/// <reference lib="dom" />
import type { ProjectRevision } from '../projects';
import { membershipPatch, type MembershipAsset } from './project-membership';
import { node, request, shortId } from './dom';

/** Uses the same conflict-checked project update contract as CLI and MCP. */
export async function mountMembership(
  target: HTMLElement,
  asset: MembershipAsset,
  name: string,
  changed: () => Promise<void>,
) {
  target.replaceChildren(node('h3', 'Project membership'));
  const { projects } = await request<{ projects: ProjectRevision[] }>('/api/projects');
  if (!target.isConnected) return;
  const content = node('div');
  target.append(content);
  const status = node('p');
  status.setAttribute('role', 'status');
  const refresh = () => mountMembership(target, asset, name, changed);
  for (const project of projects)
    for (const item of project.inventory) {
      if (
        !item.asset ||
        item.asset.collectionId !== asset.collectionId ||
        item.asset.assetId !== asset.assetId
      )
        continue;
      const row = node('div', undefined, 'membership-row');
      row.append(
        node(
          'span',
          `${project.name} / ${item.name} · ${shortId(item.asset.revisionId)}${item.asset.revisionId === asset.revisionId ? ' · this revision' : ' · another revision'}`,
        ),
      );
      const detach = node('button', 'Remove membership', 'secondary');
      detach.onclick = async () => {
        detach.disabled = true;
        try {
          await request(`/api/projects/${encodeURIComponent(project.projectId)}`, {
            method: 'PATCH',
            body: {
              expectedRevision: project.revisionId,
              patch: membershipPatch(project, item.id, null, name),
            },
          });
          await changed();
          await refresh();
        } catch (error) {
          status.textContent = `${error instanceof Error ? error.message : error} Reopen membership to load the current project.`;
          detach.disabled = false;
        }
      };
      row.append(detach);
      content.append(row);
    }
  if (!content.childElementCount)
    content.append(
      node('p', 'This asset is standalone. Project membership is optional.', 'subtle'),
    );
  if (!projects.length) {
    content.append(node('p', 'Create a named project in Projects to organize related assets.'));
    return;
  }
  const form = node('form'),
    projectSelect = node('select'),
    itemSelect = node('select');
  const projectLabel = node('label', 'Project', 'field'),
    itemLabel = node('label', 'Inventory item', 'field');
  projectLabel.append(projectSelect);
  itemLabel.append(itemSelect);
  for (const project of projects) projectSelect.append(new Option(project.name, project.projectId));
  const items = () => {
    const project = projects.find((p) => p.projectId === projectSelect.value)!;
    itemSelect.replaceChildren(new Option('Add as a new inventory item', ''));
    for (const item of project.inventory)
      itemSelect.append(
        new Option(`${item.name}${item.asset ? ' (replace linked revision)' : ''}`, item.id),
      );
    const match = project.inventory.find(
      (item) =>
        item.asset?.collectionId === asset.collectionId && item.asset.assetId === asset.assetId,
    );
    if (match) itemSelect.value = match.id;
  };
  projectSelect.onchange = items;
  items();
  const submit = node('button', 'Link this exact revision');
  submit.type = 'submit';
  form.append(
    projectLabel,
    itemLabel,
    node(
      'p',
      'Linking preserves the saved asset and its original build provenance. Replacing a link advances only this project.',
      'subtle',
    ),
    submit,
    status,
  );
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    const project = projects.find((p) => p.projectId === projectSelect.value)!;
    const inventoryId = itemSelect.value || `asset_${crypto.randomUUID().replaceAll('-', '')}`;
    try {
      await request(`/api/projects/${encodeURIComponent(project.projectId)}`, {
        method: 'PATCH',
        body: {
          expectedRevision: project.revisionId,
          patch: membershipPatch(project, inventoryId, asset, name),
        },
      });
      await changed();
      await refresh();
    } catch (error) {
      status.textContent = `${error instanceof Error ? error.message : error} Reopen membership to load the current project.`;
      submit.disabled = false;
    }
  };
  content.append(form);
}
