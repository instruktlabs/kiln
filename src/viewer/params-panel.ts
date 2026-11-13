/// <reference lib="dom" />
/**
 * The Library's parameter panel. Opening a revision shows its saved GLB and runs nothing.
 * A value the saved GLB carries (a colour as a material value, a toggle or choice as node
 * visibility) is changed here in the browser, on the saved bytes. Any other value rebuilds the
 * revision's saved source through the local host, and only after the user has said so for
 * that asset.
 */
import { applyCarriedParams, factorColorBindings, switchBindings } from '../param-bindings';
import type { ParamSpecV1, ParamValue } from '../params';
import { node } from './dom';
import {
  carriedParams,
  controlStep,
  manifestParams,
  needsRebuild,
  paramDefaults,
  presetValues,
  sliderValue,
  valueText,
  variantFileName,
  variantInput,
  type ParamValues,
} from './params-state';

export interface BuiltVariant {
  glb: Uint8Array;
  sha256?: string;
  triangles?: number;
  values: ParamValues;
  /** True when carried values were set on the saved GLB in the browser instead of a rebuild. */
  recoloured?: boolean;
}

export interface ParamsPanelHost {
  /** The library revision to rebuild; undefined for a file open only in this browser. */
  revision?: { collection: string; assetId: string; revisionId: string };
  name: string;
  manifest: { build?: { params?: unknown; paramBindings?: unknown } };
  isCurrent(): boolean;
  /** The saved GLB's bytes. */
  saved(): Promise<Uint8Array>;
  /** Show a variant in the stage, keeping the camera. */
  show(variant: BuiltVariant): Promise<void>;
  /** Show the saved GLB again. */
  restore(): Promise<void>;
  blobUrl(bytes: Uint8Array, mime: string): string;
}

/** Assets whose source the user has agreed to run, for as long as this page is open. */
const allowed = new Set<string>();
let available: Promise<boolean> | undefined;
const hostBuilds = () =>
  (available ??= fetch('/api/variant')
    .then(async (response) => response.ok && (await response.json()).available === true)
    .catch(() => false));

const REBUILD_DEBOUNCE_MS = 250;
/** A carried value only re-reads the saved bytes, so it can follow the control closely. */
const RECOLOUR_DEBOUNCE_MS = 80;

export function mountParamsPanel(target: HTMLElement, host: ParamsPanelHost): void {
  target.replaceChildren();
  const found = manifestParams(host.manifest);
  target.hidden = !found;
  if (!found) return;
  const declaration = found;
  const carried = carriedParams(declaration, host.manifest);
  const carriedMaterials = factorColorBindings(carried.bindings);
  const carriedNodes = switchBindings(carried.bindings);

  let values = paramDefaults(declaration);
  let canRebuild = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  const controls: ReturnType<typeof paramControl>[] = [];
  const presetButtons: { button: HTMLButtonElement; next: () => ParamValues }[] = [];

  const note = node('p', undefined, 'subtle');
  const enable = node('button', 'Rebuild at other values', 'secondary');
  enable.hidden = true;
  const presets = node('div', undefined, 'param-presets');
  const list = node('div', undefined, 'param-list');
  const status = node('p', undefined, 'param-status');
  status.setAttribute('role', 'status');
  const download = node('a', 'Download this variant', 'param-download');
  download.hidden = true;

  const refreshEnabled = () => {
    for (const control of controls)
      control.input.disabled = !canRebuild && !carried.names.includes(control.name);
    for (const { button, next } of presetButtons)
      button.disabled = !canRebuild && needsRebuild(declaration, carried.names, next());
  };
  const sync = () => {
    for (const control of controls) control.sync();
  };
  const changed = () => {
    download.hidden = true;
    clearTimeout(timer);
    timer = setTimeout(
      () => void run(),
      needsRebuild(declaration, carried.names, values) ? REBUILD_DEBOUNCE_MS : RECOLOUR_DEBOUNCE_MS,
    );
  };
  const offer = (glb: Uint8Array, asked: ParamValues) => {
    download.href = host.blobUrl(glb, 'model/gltf-binary');
    download.download = variantFileName(host.name, declaration, asked);
    download.hidden = false;
  };

  async function run() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        if (!host.isCurrent()) return;
        const asked = { ...values };
        const input = variantInput(declaration, asked);
        if (!input) {
          await host.restore();
          if (host.isCurrent() && !again) status.textContent = 'Showing the saved GLB.';
          continue;
        }
        if (!needsRebuild(declaration, carried.names, asked)) {
          // Only values the file carries changed: set them on the saved bytes. Nothing runs.
          const glb = applyCarriedParams(await host.saved(), carried.bindings, asked);
          if (!host.isCurrent() || again) continue;
          await host.show({ glb, values: asked, recoloured: true });
          if (!host.isCurrent()) return;
          status.textContent = 'Set in the browser · nothing was rebuilt · not saved.';
          offer(glb, asked);
          continue;
        }
        if (!canRebuild || !host.revision) {
          status.textContent = 'These values need a rebuild, which is not available here.';
          continue;
        }
        status.textContent = 'Building…';
        const started = performance.now();
        const response = await fetch('/api/variant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...host.revision, params: input }),
        });
        if (!host.isCurrent()) return;
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (!again)
            status.textContent = `${body.error ?? `Build failed (${response.status}).`} The view still shows the last build.`;
          continue;
        }
        const glb = new Uint8Array(await response.arrayBuffer());
        const built = Math.round(performance.now() - started);
        let described: { sha256?: string; triangles?: number; defaultBuildMatchesSaved?: boolean } =
          {};
        try {
          described = JSON.parse(decodeURIComponent(response.headers.get('X-Kiln-Variant') ?? ''));
        } catch {
          /* The bytes are still the build; only its description is missing. */
        }
        // Newer values are already waiting: build those rather than show this one.
        if (!host.isCurrent() || again) continue;
        await host.show({
          glb,
          sha256: described.sha256,
          triangles: described.triangles,
          values: asked,
        });
        if (!host.isCurrent()) return;
        status.textContent =
          `Built in ${built < 1000 ? `${built} ms` : `${(built / 1000).toFixed(1)} s`} · not saved.` +
          (described.defaultBuildMatchesSaved === false
            ? ' This engine builds the saved source to other bytes than the saved GLB, so the variant derives from the current build.'
            : '');
        offer(glb, asked);
      } while (again);
    } catch (error) {
      if (host.isCurrent())
        status.textContent = `Could not show these values: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      running = false;
    }
  }

  for (const [name, spec] of Object.entries(declaration.params)) {
    const materials = carriedMaterials[name];
    const nodes = carriedNodes[name];
    const isCarried = carried.names.includes(name);
    const control = paramControl(
      name,
      spec,
      () => values[name]!,
      (value) => {
        values = { ...values, [name]: value };
        changed();
      },
      isCarried && materials
        ? `Carried by the GLB: ${materials
            .map((material) => material.name ?? `material ${material.index}`)
            .join(', ')}. Changes here without a rebuild.`
        : isCarried && nodes
          ? `Carried by the GLB: shows or hides ${nodes
              .map((bound) => bound.name ?? `node ${bound.index}`)
              .join(', ')}. Changes here without a rebuild.`
          : undefined,
    );
    controls.push(control);
    list.append(control.row);
  }

  const presetButton = (label: string, next: () => ParamValues) => {
    const button = node('button', label, 'secondary');
    button.onclick = () => {
      values = next();
      sync();
      changed();
    };
    presetButtons.push({ button, next });
    presets.append(button);
  };
  presetButton('Defaults', () => paramDefaults(declaration));
  for (const preset of Object.keys(declaration.presets ?? {}))
    presetButton(preset, () => presetValues(declaration, preset));

  target.append(node('h3', 'Parameters'), note, enable, presets, list, status, download);
  refreshEnabled();

  const colours = carried.names.length
    ? ' Values the GLB carries can be changed here; nothing runs for those.'
    : '';
  if (!host.revision) {
    note.textContent = `This revision declares parameters. It is open in your browser only; import it into a collection to rebuild it at other values.${colours}`;
    return;
  }
  const consent = `${host.revision.collection}/${host.revision.assetId}`;
  note.textContent = `This revision declares parameters.${colours}`;
  void hostBuilds().then((can) => {
    if (!host.isCurrent()) return;
    if (!can) {
      note.textContent = `This revision declares parameters. This viewer was started without variant builds, so values that need a rebuild are shown but cannot be changed.${colours}`;
      return;
    }
    const ready = () => {
      enable.hidden = true;
      note.textContent =
        'The view shows the saved GLB until you change a value. A change rebuilds this revision from its saved source on this computer, except a colour the GLB carries, which is set in the browser. Nothing is saved.';
      canRebuild = true;
      refreshEnabled();
    };
    if (allowed.has(consent)) return ready();
    note.textContent = `The view shows the saved GLB, and opening it ran nothing. Rebuilding at other values runs this revision’s saved source on this computer, so only do it for assets whose source you trust.${colours}`;
    enable.hidden = false;
    enable.onclick = () => {
      allowed.add(consent);
      ready();
    };
  });
}

function paramControl(
  name: string,
  spec: ParamSpecV1,
  get: () => ParamValue,
  set: (value: ParamValue) => void,
  /** Set for a colour the GLB carries: it follows the picker live and says where it lives. */
  carriedNote?: string,
) {
  const row = node('label', undefined, 'param');
  const head = node('span', undefined, 'param-head');
  const output = node('output');
  head.append(node('span', spec.label ?? name, 'param-name'), output);
  row.append(head);
  let input: HTMLInputElement | HTMLSelectElement;
  let sync: () => void;
  if (spec.type === 'range' || spec.type === 'int') {
    const slider = node('input');
    slider.type = 'range';
    slider.min = String(spec.min);
    slider.max = String(spec.max);
    slider.step = String(controlStep(spec));
    slider.oninput = () => {
      const value = sliderValue(spec, slider.value);
      output.textContent = valueText(spec, value);
      set(value);
    };
    sync = () => {
      slider.value = String(get());
      output.textContent = valueText(spec, get());
    };
    input = slider;
  } else if (spec.type === 'toggle') {
    const box = node('input');
    box.type = 'checkbox';
    box.onchange = () => {
      output.textContent = valueText(spec, box.checked);
      set(box.checked);
    };
    sync = () => {
      box.checked = get() === true;
      output.textContent = valueText(spec, get());
    };
    input = box;
  } else if (spec.type === 'color') {
    const color = node('input');
    color.type = 'color';
    const pick = () => {
      output.textContent = color.value.toLowerCase();
      set(color.value.toLowerCase());
    };
    // `change` fires when the picker closes; `input` fires for every shade passed over, which
    // is only cheap enough to follow when the colour is set in the browser.
    if (carriedNote) color.oninput = pick;
    else color.onchange = pick;
    sync = () => {
      color.value = String(get());
      output.textContent = String(get());
    };
    input = color;
  } else if (spec.type === 'choice') {
    const select = node('select');
    for (const option of spec.options) select.append(new Option(option, option));
    select.onchange = () => set(select.value);
    sync = () => {
      select.value = String(get());
    };
    input = select;
  } else {
    const seed = node('input');
    seed.type = 'number';
    seed.min = '0';
    seed.max = '4294967295';
    seed.step = '1';
    seed.onchange = () => {
      const value = Number(seed.value);
      if (Number.isInteger(value) && value >= 0 && value <= 4294967295) set(value);
      else seed.value = String(get());
    };
    sync = () => {
      seed.value = String(get());
    };
    input = seed;
  }
  input.setAttribute('aria-label', spec.label ?? name);
  row.append(input);
  if (spec.describe) row.append(node('small', spec.describe));
  if (carriedNote) row.append(node('small', carriedNote, 'param-carried'));
  sync();
  return { name, input, sync, row };
}
