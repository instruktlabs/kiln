import { describe, expect, test } from 'bun:test';
import { DEFAULT_PREVIEW_LINES, EXPAND_SCRIPT, MIN_HIDDEN_LINES, codePreview, collapseLabel, expandLabel } from '../src/lib/code-preview';

const lines = (count: number, ending = '\n') => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join(ending);

describe('the preview of a code block', () => {
  test('counts the lines of the whole file, ignoring one trailing newline and either line ending', () => {
    expect(codePreview(lines(351)).lines).toBe(351);
    expect(codePreview(`${lines(351)}\n`).lines).toBe(351);
    expect(codePreview(lines(351, '\r\n')).lines).toBe(351);
    expect(codePreview('').lines).toBe(0);
    expect(codePreview('one').lines).toBe(1);
  });

  test('leaves a short block whole: nothing to expand', () => {
    expect(codePreview('npm install kiln')).toMatchObject({ lines: 1, hidden: 0, collapsible: false });
    expect(codePreview(lines(DEFAULT_PREVIEW_LINES + MIN_HIDDEN_LINES - 1)).collapsible).toBe(false);
  });

  test('collapses a long block to the preview, and says how much the control reveals', () => {
    expect(codePreview(lines(DEFAULT_PREVIEW_LINES + MIN_HIDDEN_LINES))).toMatchObject({ collapsible: true, previewLines: DEFAULT_PREVIEW_LINES, hidden: MIN_HIDDEN_LINES });
    expect(codePreview(lines(351))).toMatchObject({ lines: 351, collapsible: true, hidden: 351 - DEFAULT_PREVIEW_LINES });
  });

  test('takes the number of preview lines from the caller and never shows fewer than three', () => {
    expect(codePreview(lines(40), 20)).toMatchObject({ previewLines: 20, hidden: 20, collapsible: true });
    expect(codePreview(lines(40), 1).previewLines).toBe(3);
    expect(codePreview(lines(40), Number.NaN).previewLines).toBe(DEFAULT_PREVIEW_LINES);
  });

  test('the controls name what they do, in whole numbers with thousands separators', () => {
    expect(expandLabel(351)).toBe('Show all 351 lines');
    expect(expandLabel(1012)).toBe('Show all 1,012 lines');
    expect(collapseLabel).toBe('Show fewer lines');
  });
});

// The control runs as a small inline script at the end of each collapsible block, so the block collapses while the page is
// still being parsed (nothing below it has been laid out, so nothing moves) and the control appears together with its handler.
// A stand-in DOM is enough to test what it does; the browser check (verify-source.mjs) drives the real thing.
describe('the inline script that collapses a block and wires its control', () => {
  type Listener = () => void;
  const build = () => {
    const attributes = new Map<string, string>();
    const calls: string[] = [];
    let listener: Listener = () => {};
    const text = { textContent: 'Show all 351 lines' };
    const icon = { textContent: '↓' };
    const toggleAttributes = new Map<string, string>([['aria-expanded', 'false']]);
    const toggle = {
      hidden: true,
      addEventListener: (_type: string, callback: Listener) => { listener = callback; },
      getAttribute: (name: string) => toggleAttributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => { toggleAttributes.set(name, value); },
      querySelector: (selector: string) => (selector === '[data-code-expand-text]' ? text : selector === '[data-code-expand-icon]' ? icon : null),
    };
    const block = {
      dataset: { expandLabel: 'Show all 351 lines', collapseLabel: 'Show fewer lines' },
      querySelector: (selector: string) => (selector === '[data-code-expand]' ? toggle : null),
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      removeAttribute: (name: string) => { attributes.delete(name); },
      scrollIntoView: (options: unknown) => { calls.push(`scrollIntoView ${JSON.stringify(options)}`); },
    };
    new Function('document', EXPAND_SCRIPT)({ currentScript: { parentElement: block } });
    return { block, attributes, toggle, toggleAttributes, text, icon, calls, click: () => listener() };
  };

  test('is plain script text that parses on its own', () => {
    expect(() => new Function(EXPAND_SCRIPT)).not.toThrow();
    expect(EXPAND_SCRIPT).not.toMatch(/<\/script/i);
  });

  test('collapses the block and shows the control in the same step', () => {
    const { attributes, toggle } = build();
    expect(attributes.has('data-collapsed')).toBe(true);
    expect(toggle.hidden).toBe(false);
  });

  test('a click opens the block, says how to close it and reports the state', () => {
    const { attributes, toggleAttributes, text, icon, calls, click } = build();
    click();
    expect(attributes.has('data-collapsed')).toBe(false);
    expect(toggleAttributes.get('aria-expanded')).toBe('true');
    expect(text.textContent).toBe(collapseLabel);
    expect(icon.textContent).toBe('↑');
    expect(calls).toEqual([]);
  });

  test('a second click closes it again, restores the label and brings the block back into view', () => {
    const { attributes, toggleAttributes, text, icon, calls, click } = build();
    click();
    click();
    expect(attributes.has('data-collapsed')).toBe(true);
    expect(toggleAttributes.get('aria-expanded')).toBe('false');
    expect(text.textContent).toBe('Show all 351 lines');
    expect(icon.textContent).toBe('↓');
    expect(calls).toEqual(['scrollIntoView {"block":"nearest"}']);
  });

  test('does nothing, and does not throw, in a block that has no control', () => {
    const block = { querySelector: () => null, setAttribute: () => { throw new Error('collapsed a block with no control'); } };
    expect(() => new Function('document', EXPAND_SCRIPT)({ currentScript: { parentElement: block } })).not.toThrow();
  });
});
