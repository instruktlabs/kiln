/// <reference lib="dom" />
import {
  ASSET_LIMIT,
  decodeAssetBundle,
  encodeAssetBundle,
  type AssetManifest,
  type AssetRecord,
} from '../assets';
import { assetAttributionRows } from './attribution';
import { createAssetStage } from './scene';
import { bindLodControls } from './lod-control';
import { assetViewerSelection } from './deep-link';
import { exportAssetGlb } from '../asset-export';
import { mountDashboard } from './dashboard';
import { mountPerformanceControl } from './performance-control';
import type { ProjectRevision } from '../projects';
import { assetIdentity, entriesForProject } from './library-state';
import { mountMembership } from './membership-panel';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
type Entry = {
  collection: string;
  manifest: AssetManifest;
  local?: AssetRecord;
  loose?: Uint8Array;
};
let collections: { id: string; label: string }[] = [];
let projects: ProjectRevision[] = [];
let entries: Entry[] = [];
const opened: Entry[] = [];
let currentCollection = '';
let chosen: Entry | undefined;
let loadedEntry: Entry | undefined;
let stage: ReturnType<typeof createAssetStage> | undefined;
let detailGeneration = 0;
let listGeneration = 0;
let wire = false;
let paused = false;
const selected = new Set<string>();
const urls: string[] = [];
const thumbUrls: string[] = [];
const key = (entry: Entry) =>
  `${entry.collection}/${entry.manifest.assetId}/${entry.manifest.revisionId}`;
const message = (text: string) => {
  el('status').textContent = text;
};
const showError = (error: unknown) =>
  message(error instanceof Error ? error.message : String(error));
const blobUrl = (bytes: Uint8Array, mime: string, targets = urls) => {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mime }));
  targets.push(url);
  return url;
};
async function json(path: string) {
  const res = await fetch(path);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'Request failed');
  return body;
}
async function bytes(entry: Entry, file: string) {
  if (entry.local) {
    const value = entry.local.files[file];
    if (!value) throw new Error('File unavailable');
    return value;
  }
  if (entry.loose && file === 'asset.glb') return entry.loose;
  const response = await fetch(`/files/${key(entry)}/${file}`);
  if (!response.ok) throw new Error((await response.json()).error ?? 'File unavailable');
  return new Uint8Array(await response.arrayBuffer());
}
function href(entry: Entry, file: string) {
  if (entry.local) {
    if (file === 'editable.zip')
      return blobUrl(encodeAssetBundle([entry.local]), 'application/zip');
    return blobUrl(
      entry.local.files[file]!,
      file.endsWith('.js') ? 'text/javascript' : 'model/gltf-binary',
    );
  }
  if (entry.loose) return blobUrl(entry.loose, 'model/gltf-binary');
  return `/files/${key(entry)}/${file}?download`;
}
function remember(name: string, value: string) {
  try {
    localStorage.setItem(name, value);
  } catch {
    /* Files remain usable when browser storage is unavailable. */
  }
}
function recalled(name: string) {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}
function collectionNav() {
  const nav = el('collections');
  nav.replaceChildren();
  for (const collection of [
    { id: 'all', label: 'All saved assets' },
    ...collections,
    ...(opened.length ? [{ id: 'opened-files', label: 'Opened files' }] : []),
  ]) {
    const button = node(
      'button',
      collection.label,
      currentCollection === collection.id ? 'active' : '',
    );
    button.onclick = () => void loadCollection(collection.id).catch(showError);
    nav.append(button);
  }
}
async function loadCollection(id: string, showPanel = true) {
  if (showPanel) dashboard.library();
  const generation = ++listGeneration;
  currentCollection = id;
  selected.clear();
  collectionNav();
  message('');
  const loaded =
    id === 'all'
      ? await (async () => {
          const result = await json('/api/library');
          if (result.errors.length)
            message(
              result.errors
                .map(
                  (e: { collectionId: string; message: string }) =>
                    `${e.collectionId}: ${e.message}`,
                )
                .join(' · '),
            );
          return result.entries.map((e: { collectionId: string; manifest: AssetManifest }) => ({
            collection: e.collectionId,
            manifest: e.manifest,
          }));
        })()
      : id === 'opened-files'
        ? opened
        : (await json(`/api/assets?collection=${encodeURIComponent(id)}`)).assets.map(
            (manifest: AssetManifest) => ({ collection: id, manifest }),
          );
  if (generation !== listGeneration) return;
  entries = loaded;
  remember('kiln.collection', id);
  el('collection-title').textContent =
    id === 'all'
      ? 'Library'
      : id === 'opened-files'
        ? 'Opened files'
        : (collections.find((c) => c.id === id)?.label ?? id);
  el('collection-caption').textContent =
    id === 'opened-files'
      ? 'Previewed in your browser. Your original files stay untouched.'
      : 'Saved assets across registered storage. Projects link exact revisions; standalone assets belong here too.';
  renderCards();
}
function latestEntries() {
  const groups = new Map<string, Entry[]>();
  for (const entry of entriesForProject(
    entries,
    projects,
    el<HTMLSelectElement>('library-project').value,
  )) {
    const id = assetIdentity(entry);
    groups.set(id, [...(groups.get(id) ?? []), entry]);
  }
  return [...groups.values()].map((group) => {
    group.sort(
      (a, b) =>
        b.manifest.createdAt.localeCompare(a.manifest.createdAt) ||
        b.manifest.revisionId.localeCompare(a.manifest.revisionId),
    );
    return (
      group.find(
        (e) =>
          e.manifest.revisionId === recalled(`kiln.revision.${e.collection}.${e.manifest.assetId}`),
      ) ?? group[0]!
    );
  });
}
function renderCards() {
  for (const url of thumbUrls.splice(0)) URL.revokeObjectURL(url);
  const cards = el('cards');
  cards.replaceChildren();
  const query = el<HTMLInputElement>('search').value.toLowerCase();
  const shown = latestEntries().filter((e) =>
    `${e.manifest.name} ${e.manifest.tags.join(' ')}`.toLowerCase().includes(query),
  );
  el('count').textContent = `${shown.length} asset${shown.length === 1 ? '' : 's'}`;
  el<HTMLButtonElement>('export-selection').disabled = !selected.size;
  if (!shown.length) {
    const empty = node('div', undefined, 'empty');
    empty.append(
      node('b', query ? 'No matching assets' : 'Your next idea belongs here.'),
      node(
        'p',
        query
          ? 'Try another name or tag.'
          : 'Save an asset with your agent, or open a GLB or editable bundle.',
      ),
    );
    if (!query) empty.append(node('code', 'kiln save asset.kiln.js --name "My asset"'));
    cards.append(empty);
    return;
  }
  for (const entry of shown) {
    const manifest = entry.manifest;
    const card = node('article', undefined, 'card');
    const button = node('button', undefined, 'card-open');
    button.setAttribute('aria-label', `View ${manifest.name}`);
    button.onclick = () => void openDetail(entry).catch(showError);
    const thumb = node('div', undefined, 'thumb');
    if (manifest.files['preview.png']) {
      const img = node('img');
      img.loading = 'lazy';
      img.alt = manifest.name;
      img.src = entry.local
        ? blobUrl(entry.local.files['preview.png']!, 'image/png', thumbUrls)
        : `/files/${key(entry)}/preview.png`;
      img.onerror = () => {
        img.remove();
        thumb.textContent = '◇';
      };
      thumb.append(img);
    } else thumb.textContent = '◇';
    const content = node('div', undefined, 'card-content');
    content.append(node('span', manifest.name, 'card-title'));
    const revisions = entries.filter((e) => assetIdentity(e) === assetIdentity(entry));
    const parentIds = new Set(revisions.map((e) => e.manifest.parentRevision));
    const heads = revisions.filter((e) => !parentIds.has(e.manifest.revisionId));
    content.append(
      node(
        'span',
        `${manifest.editable ? 'Editable source' : 'Source unavailable'} · ${revisions.length} revision${revisions.length === 1 ? '' : 's'}${heads.length > 1 ? ` · ${heads.length} branches` : ''}`,
        'card-meta',
      ),
    );
    const tags = node('div', undefined, 'tags');
    for (const tag of manifest.tags) tags.append(node('span', tag, 'tag'));
    content.append(tags);
    content.append(
      node(
        'small',
        collections.find((c) => c.id === entry.collection)?.label ?? entry.collection,
        'card-meta',
      ),
    );
    const memberships = projects.filter((p) =>
      p.inventory.some(
        (i) =>
          i.asset &&
          i.asset.collectionId === entry.collection &&
          i.asset.assetId === manifest.assetId,
      ),
    );
    content.append(
      node(
        'small',
        memberships.length ? memberships.map((p) => p.name).join(' · ') : 'No project membership',
        'card-meta',
      ),
    );
    button.append(thumb, content);
    card.append(button);
    if (!entry.loose) {
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'selection';
      checkbox.checked = selected.has(key(entry));
      checkbox.setAttribute('aria-label', `Select ${manifest.name}`);
      checkbox.onchange = () => {
        if (checkbox.checked) selected.add(key(entry));
        else selected.delete(key(entry));
        el<HTMLButtonElement>('export-selection').disabled = !selected.size;
      };
      card.append(checkbox);
    }
    cards.append(card);
  }
}
async function openDetail(entry: Entry) {
  const generation = ++detailGeneration;
  chosen = entry;
  loadedEntry = undefined;
  stage?.cancelMeasurement('The Library selection changed. Measure the loaded revision again.');
  el('library-performance').replaceChildren();
  remember(
    `kiln.revision.${entry.collection}.${entry.manifest.assetId}`,
    entry.manifest.revisionId,
  );
  for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  const dialog = el<HTMLDialogElement>('detail');
  if (!dialog.open) dialog.showModal();
  el('asset-name').textContent = entry.manifest.name;
  const membership = el('asset-membership');
  membership.replaceChildren();
  if (!entry.local && !entry.loose) {
    const target = node('div');
    membership.append(target);
    void mountMembership(
      target,
      {
        collectionId: entry.collection,
        assetId: entry.manifest.assetId,
        revisionId: entry.manifest.revisionId,
      },
      entry.manifest.name,
      dashboard.refreshProjects,
    ).catch(showError);
  }
  const revisions = el<HTMLSelectElement>('revisions');
  revisions.replaceChildren();
  for (const item of entries.filter((e) => assetIdentity(e) === assetIdentity(entry))) {
    const option = node(
      'option',
      `${new Date(item.manifest.createdAt).toLocaleString()} · ${item.manifest.description || item.manifest.revisionId.slice(0, 10)}`,
    );
    option.value = item.manifest.revisionId;
    option.selected = item.manifest.revisionId === entry.manifest.revisionId;
    revisions.append(option);
  }
  revisions.onchange = () => {
    const next = entries.find(
      (e) => assetIdentity(e) === assetIdentity(entry) && e.manifest.revisionId === revisions.value,
    );
    if (next) void openDetail(next).catch(showError);
  };
  el('asset-description').textContent =
    entry.manifest.description ??
    entry.manifest.brief ??
    (entry.manifest.editable
      ? 'Source travels with this revision. Download the editable bundle to continue elsewhere.'
      : 'This GLB has no saved Kiln source. You can view and use the model.');
  const attribution = el('asset-attribution');
  attribution.replaceChildren();
  for (const row of assetAttributionRows(entry.manifest)) {
    const item = node('div');
    item.append(node('span', row.label), node('strong', row.value));
    attribution.append(item);
  }
  attribution.hidden = !attribution.childElementCount;
  el('provenance').textContent = entry.loose
    ? 'Standalone GLB. No source or build provenance supplied.'
    : JSON.stringify(entry.manifest, null, 2);
  const downloads = el('downloads');
  downloads.replaceChildren();
  for (const [file, label] of [
    ['asset.glb', 'Original GLB'],
    ...(entry.manifest.editable ? [['source.kiln.js', 'Download source']] : []),
    ...(!entry.loose
      ? [
          [
            'editable.zip',
            entry.manifest.editable ? 'Download editable bundle' : 'Download asset bundle',
          ],
        ]
      : []),
  ]) {
    const link = node('a', label);
    link.href = href(entry, file!);
    link.download = `${entry.manifest.name.replace(/[^a-z0-9_-]/gi, '-')}${file === 'asset.glb' ? '.glb' : file === 'source.kiln.js' ? '.kiln.js' : '.zip'}`;
    downloads.append(link);
  }
  if (!entry.loose) {
    const runtime = node('button', 'Runtime GLB');
    const status = node('span');
    status.setAttribute('role', 'status');
    runtime.onclick = async () => {
      runtime.disabled = true;
      status.textContent = 'Preparing runtime download…';
      try {
        const output = entry.local
          ? await exportAssetGlb(entry.local, { profile: 'runtime' })
          : undefined;
        const [glb, metadata] =
          output?.profile === 'runtime'
            ? [output.glb, output.metadata.bytes]
            : await Promise.all([
                bytes(entry, 'runtime.glb'),
                bytes(entry, 'runtime.kiln-metadata.json'),
              ]);
        if (generation !== detailGeneration) return;
        const glbLink = node('a', 'Runtime GLB');
        glbLink.href = blobUrl(glb, 'model/gltf-binary');
        glbLink.download = 'runtime.glb';
        const metadataLink = node('a', 'Runtime metadata');
        metadataLink.href = blobUrl(metadata, 'application/json');
        // Keep the exact sibling filename referenced by the runtime GLB.
        metadataLink.download = 'runtime.kiln-metadata.json';
        runtime.replaceWith(glbLink, metadataLink);
        status.textContent = 'Keep the companion metadata for traceability.';
        glbLink.click();
      } catch (error) {
        if (generation !== detailGeneration) return;
        status.textContent = `Runtime export unavailable: ${error instanceof Error ? error.message : error}`;
        runtime.disabled = false;
      }
    };
    downloads.append(runtime, status);
    downloads.append(
      node(
        'p',
        'Original GLB retains Kiln review data. Runtime GLB moves duplicate animation-review data into a companion JSON file; geometry and textures are unchanged. Keep the editable bundle for source and build records.',
      ),
    );
  }
  el<HTMLButtonElement>('refine').disabled = !entry.manifest.editable;
  el('asset-stats').replaceChildren();
  el('stage-status').textContent = 'Loading saved GLB…';
  wire = false;
  paused = false;
  el('wire').setAttribute('aria-pressed', 'false');
  el('play').textContent = 'Pause';
  const animation = el<HTMLSelectElement>('animation');
  animation.replaceChildren(new Option('Rest pose', ''));
  el<HTMLButtonElement>('play').disabled = true;
  const level = el<HTMLSelectElement>('level');
  level.replaceChildren();
  level.hidden = true;
  el('library-lod').replaceChildren();
  el('library-lod').hidden = true;
  try {
    stage ??= createAssetStage(el('stage'));
    const data = await bytes(entry, 'asset.glb');
    if (generation !== detailGeneration) return;
    const info = await stage.load(data, {
      isCurrent: () => generation === detailGeneration,
      onCommit: () => {
        loadedEntry = entry;
      },
    });
    if (!info || generation !== detailGeneration) return;
    loadedEntry = entry;
    stage.wire(false);
    stage.navigation(el<HTMLSelectElement>('library-navigation').value);
    stage.lighting(el<HTMLSelectElement>('lighting').value);
    bindLodControls(level, el('library-lod'), stage);
    for (const [value, label] of [
      ...(info.levels
        ? info.levels.map((count, i) => [count.toLocaleString(), `LOD${i} triangles`])
        : [[info.triangles.toLocaleString(), 'triangles']]),
      [info.meshes, info.levels ? 'LOD0 meshes' : 'meshes'],
      [info.materials, info.levels ? 'LOD0 materials' : 'materials'],
      [`${(data.length / 1024).toFixed(0)} KB`, 'GLB'],
    ]) {
      const item = node('div');
      item.append(node('strong', String(value)), node('span', String(label)));
      el('asset-stats').append(item);
    }
    for (let i = 0; i < info.clips.length; i++)
      animation.append(new Option(info.clips[i], String(i)));
    el('stage-status').textContent = '';
  } catch (error) {
    if (generation === detailGeneration) {
      stage?.dispose();
      stage = undefined;
      el('stage-status').textContent =
        `3D preview unavailable: ${error instanceof Error ? error.message : error}. Downloads remain available.`;
    }
  }
}
async function openFiles(files: { name: string; bytes: Uint8Array }[]) {
  for (const file of files) {
    if (file.bytes.length > ASSET_LIMIT) throw new Error('File exceeds 64 MiB');
    if (file.name.toLowerCase().endsWith('.zip')) {
      for (const record of decodeAssetBundle(file.bytes)) {
        for (const [name, data] of Object.entries(record.files)) {
          const digest = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(data))),
          )
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
          if (`sha256:${digest}` !== record.manifest.files[name]?.sha256)
            throw new Error(`Bundle integrity failure: ${name}`);
        }
        if (
          !opened.some(
            (e) =>
              e.manifest.revisionId === record.manifest.revisionId &&
              e.manifest.assetId === record.manifest.assetId,
          )
        )
          opened.push({ collection: 'opened-files', manifest: record.manifest, local: record });
      }
    } else {
      const id = `a_${crypto.randomUUID().replaceAll('-', '')}`;
      opened.push({
        collection: 'opened-files',
        loose: file.bytes,
        manifest: {
          version: 'kiln.asset.v1',
          assetId: id,
          revisionId: `r_${id}`,
          name: file.name.replace(/\.glb$/i, ''),
          tags: [],
          createdAt: new Date().toISOString(),
          editable: false,
          files: {},
        },
      });
    }
  }
  await loadCollection('opened-files');
}
el<HTMLInputElement>('open').onchange = async (event) => {
  try {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (files.some((f) => f.size > ASSET_LIMIT)) throw new Error('File exceeds 64 MiB');
    await openFiles(
      await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      ),
    );
  } catch (error) {
    showError(error);
  }
};
el('refresh').onclick = () => void loadCollection(currentCollection).catch(showError);
el('search').oninput = renderCards;
el('library-project').onchange = () => void loadCollection('all').catch(showError);
el('close-detail').onclick = () => el<HTMLDialogElement>('detail').close();
el<HTMLDialogElement>('detail').addEventListener('close', () => {
  detailGeneration++;
  loadedEntry = undefined;
  stage?.dispose();
  stage = undefined;
  for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  renderCards();
});
el('frame').onclick = () => stage?.reset();
el('wire').onclick = () => {
  wire = !wire;
  stage?.wire(wire);
  el('wire').setAttribute('aria-pressed', String(wire));
};
el<HTMLSelectElement>('lighting').onchange = (event) =>
  stage?.lighting((event.target as HTMLSelectElement).value);
el<HTMLSelectElement>('library-navigation').onchange = (event) => {
  const value = (event.target as HTMLSelectElement).value;
  stage?.navigation(value);
  el('library-navigation-help').textContent =
    value === 'explore'
      ? 'Focus the viewport, then W A S D to move · Q / E down / up · Shift faster · Drag to look around · No collision simulation.'
      : 'Drag to orbit · Scroll to zoom · Right-drag to pan';
};
el<HTMLSelectElement>('animation').onchange = (event) => {
  const value = (event.target as HTMLSelectElement).value;
  stage?.clip(value === '' ? -1 : Number(value));
  el<HTMLButtonElement>('play').disabled = value === '';
};
el('play').onclick = () => {
  paused = !paused;
  stage?.pause(paused);
  el('play').textContent = paused ? 'Play' : 'Pause';
};
el('refine').onclick = async () => {
  if (!chosen) return;
  const manifest = chosen.manifest;
  const text = chosen.local
    ? `Import the downloaded editable bundle using kiln import <bundle.zip>. Restore asset ${manifest.assetId}, revision ${manifest.revisionId}, using kiln_assets action=restore. Read its source with kiln_source, refine it with kiln_edit, review the result, and save a child revision with kiln_save. Requested change: `
    : `Use kiln_assets with action=restore, collection=${chosen.collection}, assetId=${manifest.assetId}, revisionId=${manifest.revisionId}. Read the returned programRef with kiln_source, refine it with kiln_edit, review the result, and save with kiln_save using assetId=${manifest.assetId}, parentRevision=${manifest.revisionId}, collection=${chosen.collection}. Requested change: `;
  try {
    await navigator.clipboard.writeText(text);
    el('refine').textContent = 'Instructions copied';
  } catch {
    el('provenance').textContent = text;
    el('provenance').parentElement?.setAttribute('open', '');
  }
};
el('export-selection').onclick = () => {
  try {
    const link = node('a');
    if (currentCollection === 'opened-files')
      link.href = blobUrl(
        encodeAssetBundle(entries.filter((e) => selected.has(key(e))).map((e) => e.local!)),
        'application/zip',
      );
    else {
      const params = new URLSearchParams();
      for (const id of selected) params.append('revision', id);
      link.href = `/api/bundle?${params}`;
    }
    link.download = 'kiln-assets.zip';
    link.click();
  } catch (error) {
    showError(error);
  }
};
async function start() {
  collections = (await json('/api/collections')).collections;
  const requested = assetViewerSelection(location.search);
  await loadCollection(collections.find((c) => c.id === requested?.collection)?.id ?? 'all', false);
  if (requested) {
    const exact = entries.find(
      (entry) =>
        entry.collection === requested.collection &&
        entry.manifest.assetId === requested.assetId &&
        entry.manifest.revisionId === requested.revisionId,
    );
    if (!exact) throw new Error('The requested saved revision is not available.');
    await openDetail(exact);
  }
  if (new URLSearchParams(location.search).has('open')) {
    const response = await fetch('/api/standalone');
    if (!response.ok) throw new Error('File unavailable');
    await openFiles([
      {
        name: response.headers.get('Content-Type')?.includes('zip') ? 'asset.zip' : 'asset.glb',
        bytes: new Uint8Array(await response.arrayBuffer()),
      },
    ]);
    if (opened.length === 1) await openDetail(opened[0]!);
  }
}
const dashboard = mountDashboard(
  (asset) => {
    void (async () => {
      await loadCollection(asset.collectionId);
      const entry = entries.find(
        (item) =>
          item.manifest.assetId === asset.assetId && item.manifest.revisionId === asset.revisionId,
      );
      if (!entry) throw new Error('The linked saved revision is not available in this collection.');
      await openDetail(entry);
    })().catch(showError);
  },
  (value) => {
    projects = value;
    const select = el<HTMLSelectElement>('library-project'),
      previous = select.value;
    select.replaceChildren(
      new Option('All projects and standalone', ''),
      new Option('Standalone assets', 'standalone'),
    );
    for (const project of projects) select.append(new Option(project.name, project.projectId));
    if (previous === 'standalone' || projects.some((p) => p.projectId === previous))
      select.value = previous;
    renderCards();
  },
);
mountPerformanceControl(
  el<HTMLButtonElement>('measure-library'),
  el('library-performance'),
  () => stage,
  () =>
    loadedEntry && chosen && key(loadedEntry) === key(chosen)
      ? {
          collection: loadedEntry.collection,
          assetId: loadedEntry.manifest.assetId,
          revisionId: loadedEntry.manifest.revisionId,
          glbSha256: loadedEntry.manifest.files['asset.glb']?.sha256,
        }
      : undefined,
);
void start().catch(showError);
