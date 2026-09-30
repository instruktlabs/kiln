/// <reference lib="dom" />
import { mountProjects } from './projects-panel';
import { mountMaterials } from './materials-panel';
import { mountLiveReview } from './live-panel';
import { el, notice, remember, recall } from './dom';
import { initialWorkspaceSection, workspaceSections } from './navigation';

export function mountDashboard(
  openAsset: (asset: { collectionId: string; assetId: string; revisionId: string }) => void,
  projectsChanged: (projects: import('../projects').ProjectRevision[]) => void = () => {},
) {
  const sections: readonly string[] = workspaceSections;
  function section(name: string) {
    if (!sections.includes(name)) return;
    for (const id of sections) el(`${id}-panel`).hidden = id !== name;
    for (const button of document.querySelectorAll<HTMLButtonElement>('#workspace-nav button')) {
      const active = button.dataset.section === name;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    remember('kiln.section', name);
    if (name === 'live') live.activate();
    if (name === 'materials') void materials.refresh().catch(notice);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('#workspace-nav button'))
    button.onclick = () => section(button.dataset.section!);
  el('open-files').onclick = () => el<HTMLInputElement>('open').click();
  const live = mountLiveReview();
  const materials = mountMaterials(() => projects.refresh());
  const projects = mountProjects({
    changed: (value) => {
      live.projects(value);
      materials.projects(value);
      projectsChanged(value);
    },
    openAsset: (asset) => {
      section('library');
      openAsset(asset);
    },
  });
  section(initialWorkspaceSection(location.search, recall('kiln.section')));
  void projects.refresh().catch(notice);
  void materials.refresh().catch(notice);
  // Configuration may be edited by CLI/MCP while the dashboard remains open.
  let refreshing = false;
  window.setInterval(async () => {
    if (document.hidden || refreshing || el<HTMLDialogElement>('project-editor').open) return;
    refreshing = true;
    try {
      await projects.refresh();
    } catch {
      /* Live connection badge reports host availability. */
    } finally {
      refreshing = false;
    }
  }, 5000);
  return { library: () => section('library'), refreshProjects: projects.refresh };
}
