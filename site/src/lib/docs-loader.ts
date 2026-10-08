import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';
import { decorateDocsHtml } from './docs-html';
import { DOC_PAGES } from './docs-navigation';

export function repositoryDocs(): Loader {
  return {
    name: 'kiln-repository-docs',
    async load({ config, store, parseData, renderMarkdown, logger, watcher }) {
      const root = fileURLToPath(config.root);
      const configured = process.env.KILN_SITE_DOCS_DIR || '../docs';
      const directory = isAbsolute(configured) ? configured : resolve(root, configured);
      const sync = async () => {
        const documents = [];
        for (const [order, page] of DOC_PAGES.entries()) {
          const filePath = resolve(directory, `${page.slug}.md`);
          try {
            const markdown = await readFile(filePath, 'utf8');
            const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim();
            if (!title) throw new Error(`Documentation has no H1: ${filePath}`);
            documents.push({ page, order, filePath, markdown, title });
          } catch (error) {
            if (
              page.optional &&
              error instanceof Error &&
              'code' in error &&
              error.code === 'ENOENT'
            ) {
              logger.warn(
                `Optional documentation is absent: ${page.slug}.md. Check KILN_SITE_DOCS_DIR to include it.`,
              );
            } else {
              throw error;
            }
          }
        }
        const available = new Set(documents.map(({ page }) => page.slug));
        store.clear();
        for (const { page, order, filePath, markdown, title } of documents) {
          const rendered = await renderMarkdown(markdown);
          rendered.html = decorateDocsHtml(rendered.html, page.slug, available).replace(
            /<h1\b[^>]*>[\s\S]*?<\/h1>/,
            '',
          );
          const data = await parseData({
            id: page.slug,
            data: {
              title,
              label: page.label,
              description: page.description,
              group: page.group,
              order,
              source: `https://github.com/instruktlabs/kiln/blob/main/docs/${page.slug}.md`,
            },
          });
          store.set({
            id: page.slug,
            data,
            body: markdown,
            rendered,
            filePath: relative(root, filePath).split(sep).join('/'),
          });
        }
      };
      await sync();
      watcher?.add(directory);
      watcher?.on('change', async (path) => {
        if (DOC_PAGES.some((page) => resolve(directory, `${page.slug}.md`) === path)) await sync();
      });
    },
  };
}
