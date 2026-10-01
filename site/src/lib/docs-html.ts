const REPOSITORY = 'https://github.com/matthew-kissinger/kiln';

/** Resolve only URLs emitted by the repository Markdown renderer, never code examples. */
export function rewriteDocsUrl(href: string, slug: string, available: Set<string>): string | null {
  if (/^(?:[a-z]:[\\/]|file:|javascript:|data:)/i.test(href)) return null;
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return href;
  const target = new URL(
    href.replaceAll('&amp;', '&'),
    `https://repository.invalid/docs/${slug}.md`,
  );
  const match = /^\/docs\/([^/]+)\.md$/.exec(target.pathname);
  if (match?.[1] && available.has(match[1])) {
    return `/docs/${match[1]}/${target.search}${target.hash}`;
  }
  return `${REPOSITORY}/blob/main${target.pathname}${target.search}${target.hash}`;
}

const escapeAttribute = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

/** Small transformations on Astro's rendered HTML keep Markdown as the only content source. */
export function decorateDocsHtml(html: string, slug: string, available: Set<string>): string {
  let codeNumber = 0;
  let tableNumber = 0;
  return (
    html
      // Generated tool descriptions contain literal CLI placeholders outside code fences.
      .replace(/<(file|name)>/g, '&lt;$1&gt;')
      .replace(
        /<a\b([^>]*?)href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g,
        (_whole, before: string, href: string, after: string, label: string) => {
          const resolved = rewriteDocsUrl(href, slug, available);
          if (resolved === null)
            return `${label} <span class="docs-local-note">(local file)</span>`;
          return `<a${before}href="${escapeAttribute(resolved)}"${after}>${label}</a>`;
        },
      )
      .replace(
        /<h([2-6])\b([^>]*?)id="([^"]+)"([^>]*)>([\s\S]*?)<\/h\1>/g,
        (_whole, level: string, before: string, id: string, after: string, label: string) =>
          `<h${level}${before}id="${id}"${after}>${label}<a class="docs-heading-link" href="#${id}" aria-hidden="true" tabindex="-1">#</a></h${level}>`,
      )
      .replace(
        /<pre\b([^>]*)>([\s\S]*?)<\/pre>/g,
        (_whole, attributes: string, code: string) =>
          `<div role="group" class="docs-code not-prose" aria-label="Code example ${++codeNumber}"><div class="docs-code-actions"><span data-scroll-hint hidden>Scroll code horizontally</span><button type="button" data-copy-docs hidden aria-label="Copy code example ${codeNumber}">Copy code</button></div><pre${attributes.includes('tabindex=') ? attributes : `${attributes} tabindex="0"`}>${code}</pre></div>`,
      )
      .replace(/<table>([\s\S]*?)<\/table>/g, (_whole, table: string) => {
        const header = /<thead>([\s\S]*?)<\/thead>/.exec(table)?.[1] ?? '';
        const labels = Array.from(header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g), (match) =>
          (match[1] ?? '').replace(/<[^>]*>/g, '').replaceAll('&amp;', '&'),
        );
        const labelled = table.replace(/<tr>([\s\S]*?)<\/tr>/g, (_row, cells: string) => {
          let column = 0;
          return `<tr>${cells.replace(/<td\b([^>]*)>/g, (_cell, attrs: string) => {
            const label = labels[column++];
            return `<td${attrs}${label ? ` data-label="${escapeAttribute(label)}"` : ''}>`;
          })}</tr>`;
        });
        return `<section class="docs-table-scroll${labels.length ? ' docs-table-labelled' : ''}" aria-label="Documentation table ${++tableNumber}" tabindex="0"><table>${labelled}</table></section>`;
      })
  );
}
