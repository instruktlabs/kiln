/**
 * How a long code block is shown: the first lines of the whole file, cut off with a fade, and a control that
 * reveals the rest in place. The block always holds the whole file, so copying and reading it never depend on
 * what is visible.
 */
export const DEFAULT_PREVIEW_LINES = 14;
/** A block collapses only when at least this many lines would be hidden: "show 3 more lines" is not worth a control. */
export const MIN_HIDDEN_LINES = 6;
const LEAST_PREVIEW_LINES = 3;

export interface CodePreview {
  /** Lines in the whole file. */
  lines: number;
  /** Lines visible before the fade. */
  previewLines: number;
  /** Lines the expand control reveals. */
  hidden: number;
  collapsible: boolean;
}

export function codePreview(
  code: string,
  previewLines: number = DEFAULT_PREVIEW_LINES,
): CodePreview {
  const trimmed = code.replace(/\r?\n$/, '');
  const lines = trimmed.length === 0 ? 0 : trimmed.split(/\r?\n/).length;
  const shown = Number.isFinite(previewLines)
    ? Math.max(LEAST_PREVIEW_LINES, Math.round(previewLines))
    : DEFAULT_PREVIEW_LINES;
  const hidden = Math.max(0, lines - shown);
  return { lines, previewLines: shown, hidden, collapsible: hidden >= MIN_HIDDEN_LINES };
}

export const expandLabel = (lines: number) => `Show all ${lines.toLocaleString('en-US')} lines`;
export const collapseLabel = 'Show fewer lines';

/**
 * The control's behaviour, as the small classic script that ends each collapsible block. Running while the page is still
 * being parsed is the point: the block collapses before anything after it exists, so nothing on screen moves, and the
 * control appears in the same step as its handler, so it is never shown without working. Without scripts the block stays
 * whole and the control stays hidden. Plain ES5 text with no dependencies (it is inlined, not bundled).
 */
export const EXPAND_SCRIPT = `(function (block) {
  var toggle = block.querySelector("[data-code-expand]");
  if (!toggle) return;
  var text = toggle.querySelector("[data-code-expand-text]");
  var icon = toggle.querySelector("[data-code-expand-icon]");
  block.setAttribute("data-collapsed", "");
  toggle.hidden = false;
  toggle.addEventListener("click", function () {
    var expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    if (expanded) block.setAttribute("data-collapsed", "");
    else block.removeAttribute("data-collapsed");
    text.textContent = expanded ? block.dataset.expandLabel : block.dataset.collapseLabel;
    icon.textContent = expanded ? "↓" : "↑";
    if (expanded) block.scrollIntoView({ block: "nearest" });
  });
})(document.currentScript.parentElement);`;
