/// <reference lib="dom" />
import { node } from './dom';
import { levelLabels, type ViewerLevelState } from './lod';

interface LodStage {
  lod(): ViewerLevelState | undefined;
  level(index: number): void;
  partLevel(id: string, index: number): void;
}

/** Bind the simple selector and independently selectable parts to one loaded artifact. */
export function bindLodControls(
  select: HTMLSelectElement,
  container: HTMLElement,
  stage: LodStage,
  changed?: (globalIndex?: number) => void,
) {
  const state = stage.lod();
  select.hidden = !state;
  container.hidden = !state;
  container.replaceChildren();
  select.replaceChildren();
  select.onchange = null;
  if (!state) return undefined;

  select.append(
    ...levelLabels(state.levels).map((label, index) => new Option(label, String(index))),
  );
  const mixed = new Option('Mixed part levels', 'mixed');
  mixed.disabled = true;
  select.append(mixed);
  const total = node('p', '', 'lod-total');
  total.setAttribute('role', 'status');
  container.append(total);
  const inputs = new Map<string, HTMLSelectElement>();
  if (state.chains.length > 1) {
    const details = node('details', undefined, 'lod-parts');
    details.append(node('summary', 'Per-part levels'));
    details.append(
      node(
        'p',
        'Choose a level for each part. The main selector sets every part to the same index.',
        'subtle',
      ),
    );
    const fields = node('div', undefined, 'lod-part-fields');
    const duplicateLabels = new Set(
      state.chains
        .filter((chain, i, all) => all.findIndex((other) => other.label === chain.label) !== i)
        .map((chain) => chain.label),
    );
    for (const [i, chain] of state.chains.entries()) {
      const label = duplicateLabels.has(chain.label)
        ? `${chain.label} (part ${i + 1})`
        : chain.label;
      const field = node('label', label, 'inline-field');
      const input = node('select');
      input.setAttribute('aria-label', `${label} level of detail`);
      input.append(
        ...levelLabels(chain.triangles).map((text, level) => new Option(text, String(level))),
      );
      input.onchange = () => {
        stage.partLevel(chain.id, Number(input.value));
        refresh();
        changed?.();
      };
      inputs.set(chain.id, input);
      field.append(input);
      fields.append(field);
    }
    details.append(fields);
    container.append(details);
  }

  function refresh() {
    const current = stage.lod();
    if (!current) return;
    // Shorter chains clamp to their last level when the global selector sets every part.
    const uniform = current.levels.findIndex((_, index) =>
      current.chains.every((chain) => chain.level === Math.min(index, chain.triangles.length - 1)),
    );
    select.value = uniform < 0 ? 'mixed' : String(uniform);
    total.textContent = `${current.triangles.toLocaleString()} triangles displayed`;
    for (const chain of current.chains) {
      const input = inputs.get(chain.id);
      if (input) input.value = String(chain.level);
    }
  }
  select.onchange = () => {
    if (select.value === 'mixed') return;
    const index = Number(select.value);
    stage.level(index);
    refresh();
    changed?.(index);
  };
  refresh();
  return { refresh };
}
