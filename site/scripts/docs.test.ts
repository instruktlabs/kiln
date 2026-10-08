import { describe, expect, test } from 'bun:test';
import { decorateDocsHtml, rewriteDocsUrl } from '../src/lib/docs-html';

const available = new Set(['install', 'programs', 'material-library']);
describe('published documentation links', () => {
  test('routes available docs and preserves anchors and query strings', () => {
    expect(rewriteDocsUrl('./programs.md#edits', 'install', available)).toBe('/docs/programs/#edits');
    expect(rewriteDocsUrl('../docs/install.md?source=guide#start', 'programs', available)).toBe('/docs/install/?source=guide#start');
  });
  test('sends unpublished docs and repository files to their repository location', () => {
    expect(rewriteDocsUrl('projects-and-live-review.md', 'install', available)).toBe('https://github.com/instruktlabs/kiln/blob/main/docs/projects-and-live-review.md');
    expect(rewriteDocsUrl('../src/tools/registry.ts#L12', 'install', available)).toBe('https://github.com/instruktlabs/kiln/blob/main/src/tools/registry.ts#L12');
    expect(rewriteDocsUrl('plans/internal.md', 'install', available)).toBe('https://github.com/instruktlabs/kiln/blob/main/docs/plans/internal.md');
  });
  test('keeps external, origin-relative and same-page references', () => {
    for (const href of ['https://example.com/a?q=b#c', '#revision', '/gallery/', 'mailto:hello@example.com']) {
      expect(rewriteDocsUrl(href, 'install', available)).toBe(href);
    }
  });
  test('does not publish local file links or unsafe protocols', () => {
    for (const href of ['C:/Users/person/file.md', 'file:///tmp/report.md', 'javascript:alert(1)']) {
      expect(rewriteDocsUrl(href, 'install', available)).toBeNull();
    }
  });
  test('rewrites links without altering escaped code and adds keyboard accessible enhancements', () => {
    const html = '<h2 id="read-source">Read source</h2><p><a href="programs.md#source">Source</a> <a href="C:/local.md">Local record</a></p><pre class="astro-code"><code>&lt;a href="programs.md"&gt;</code></pre><table><tr><td>Metric</td></tr></table>';
    const result = decorateDocsHtml(html, 'install', available);
    expect(result).toContain('href="/docs/programs/#source"');
    expect(result).toContain('Local record <span class="docs-local-note">(local file)</span>');
    expect(result).not.toContain('href="C:/');
    expect(result).toContain('&lt;a href="programs.md"&gt;');
    expect(result).toContain('href="#read-source"');
    expect(result).toContain('data-copy-docs hidden');
    expect(result).toContain('class="docs-table-scroll"');
    expect(result).toContain('tabindex="0"');
  });
});

test('uses native named sections and preserves literal command placeholders', () => {
  const result = decorateDocsHtml('<p>Use --file <file> and --name <name>.</p><pre><code>one</code></pre><pre><code>two</code></pre><table><thead><tr><th>Key</th></tr></thead><tbody><tr><td>Value</td></tr></tbody></table>', 'tools', available);
  expect(result).toContain('&lt;file&gt;');
  expect(result).toContain('&lt;name&gt;');
  expect(result).toContain('<div role="group" class="docs-code not-prose" aria-label="Code example 1">');
  expect(result).toContain('aria-label="Code example 2"');
  expect(result).toContain('<section class="docs-table-scroll docs-table-labelled"');
  expect(result).toContain('data-label="Key"');
  expect(result).not.toContain('role="region"');
  expect(result).toContain('aria-label="Copy code example 1"');
  expect(result).toContain('aria-label="Copy code example 2"');
});

test('heading permalinks do not add every heading to the keyboard order', () => {
  expect(decorateDocsHtml('<h2 id="one">One</h2>', 'install', available)).toContain('aria-hidden="true" tabindex="-1"');
});
