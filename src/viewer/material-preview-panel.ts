/// <reference lib="dom" />
import type { MaterialManifest } from '../material-library';
import { node } from './dom';
import {
  materialPreviewModel,
  materialViewerHref,
  type MaterialPreviewMap,
} from './material-preview';

/** Raw PNG inspection only. Recorded capture fidelity belongs to the asset/operation. */
export function materialPreviewPanel(manifest: MaterialManifest) {
  const model = materialPreviewModel(manifest),
    panel = node('section', undefined, 'material-inspection');
  panel.setAttribute('aria-label', `${model.name}: exact material maps`);
  panel.append(
    node('p', `${model.materialId} · ${model.revisionId}`, 'mono'),
    node('p', model.fidelity, 'subtle'),
  );
  const controls = node('div', undefined, 'material-inspection-controls');
  const field = (label: string, select: HTMLSelectElement) => {
    const wrapper = node('label', label, 'inline-field');
    wrapper.append(select);
    controls.append(wrapper);
    return select;
  };
  const mapSelect = field('Map', node('select'));
  for (const map of model.maps)
    mapSelect.append(new Option(`${map.slot}${map.atlas ? ' · atlas' : ''}`, map.slot));
  const backdrop = field('Backdrop', node('select'));
  for (const value of ['checker', 'light', 'dark'])
    backdrop.append(new Option(value[0]!.toUpperCase() + value.slice(1), value));
  const zoom = field('Pixel zoom', node('select'));
  for (const scale of [1, 2, 4]) zoom.append(new Option(`${scale}×`, String(scale)));
  const frame = node('div', undefined, 'material-pixel-frame'),
    sheet = node('div', undefined, 'material-pixel-sheet');
  frame.dataset.backdrop = 'checker';
  frame.tabIndex = 0;
  const image = node('img');
  image.className = 'material-pixel-image';
  image.loading = 'lazy';
  image.draggable = false;
  const overlay = node('div', undefined, 'material-region-overlay');
  const overlayControl = node('label', 'Region overlays', 'inline-field');
  const overlayToggle = node('input');
  overlayToggle.type = 'checkbox';
  overlayToggle.checked = false;
  overlayControl.append(overlayToggle);
  controls.append(overlayControl);
  overlayToggle.onchange = () => {
    overlay.hidden = !overlayToggle.checked;
  };
  sheet.append(image, overlay);
  frame.append(sheet);
  const status = node('p', undefined, 'subtle');
  status.setAttribute('role', 'status');
  const facts = node('dl'),
    regions = node('div', undefined, 'material-region-list');
  const exact = node('a', 'Open this saved material revision');
  exact.href = materialViewerHref(model);
  exact.target = '_blank';
  exact.rel = 'noopener';
  panel.append(controls, frame, status, facts, regions, exact);
  let current: MaterialPreviewMap = model.maps[0]!;
  const size = () => {
    sheet.style.width = `${current.width * Number(zoom.value)}px`;
    sheet.style.height = `${current.height * Number(zoom.value)}px`;
  };
  const show = () => {
    current = model.maps.find((map) => map.slot === mapSelect.value) ?? model.maps[0]!;
    overlayControl.hidden = !current.atlas;
    overlay.hidden = !current.atlas || !overlayToggle.checked;
    status.textContent = 'Loading exact saved map…';
    image.alt = `${model.name}: ${current.slot}${current.atlas ? ' atlas sheet' : ''}, raw unshaded pixels`;
    image.width = current.width;
    image.height = current.height;
    image.src = current.url;
    size();
    facts.replaceChildren();
    const fact = (label: string, value: string) =>
      facts.append(node('dt', label), node('dd', value));
    fact(
      'Image',
      `${current.width} × ${current.height} · ${current.colorSpace} · nearest pixel display`,
    );
    fact(
      'Sampling declaration',
      current.sampler
        ? `${current.sampler.minFilter} / ${current.sampler.magFilter} · ${current.sampler.wrapS} / ${current.sampler.wrapT}`
        : 'Not recorded in V1',
    );
    fact('PNG hash', current.imageSha256);
    if (current.pixelHash) fact('Decoded RGBA hash', current.pixelHash);
    if (current.compilerId) fact('Compiler', current.compilerId);
    if (current.manifestHash) fact('Atlas manifest hash', current.manifestHash);
    overlay.replaceChildren();
    regions.replaceChildren();
    if (current.atlas) {
      regions.append(node('h4', 'Atlas regions · top-left pixel coordinates'));
      for (const region of current.regions) {
        const box = node('span', undefined, 'material-region-box');
        box.style.left = `${region.leftPercent}%`;
        box.style.top = `${region.topPercent}%`;
        box.style.width = `${region.widthPercent}%`;
        box.style.height = `${region.heightPercent}%`;
        box.append(node('span', region.name));
        box.setAttribute('aria-hidden', 'true');
        overlay.append(box);
        const item = node(
          'button',
          `${region.name}: content ${region.content.x},${region.content.y} ${region.content.width}×${region.content.height}; allocation ${region.allocation.x},${region.allocation.y} ${region.allocation.width}×${region.allocation.height}`,
          'secondary',
        );
        item.type = 'button';
        item.setAttribute('aria-pressed', 'false');
        item.onclick = () => {
          for (const candidate of overlay.children) candidate.classList.remove('selected');
          for (const button of regions.querySelectorAll('button'))
            button.setAttribute('aria-pressed', 'false');
          box.classList.add('selected');
          item.setAttribute('aria-pressed', 'true');
          if (!overlay.hidden) box.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        };
        regions.append(item);
      }
    }
  };
  image.onload = () => {
    status.textContent = 'Raw map loaded. These pixels are not a shaded capture.';
  };
  image.onerror = () => {
    status.textContent = `Exact ${model.materialId} revision map unavailable. No newer revision was substituted.`;
  };
  mapSelect.onchange = show;
  backdrop.onchange = () => {
    frame.dataset.backdrop = backdrop.value;
  };
  zoom.onchange = size;
  show();
  return panel;
}
