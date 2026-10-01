import { expect, test } from 'bun:test';
import { isAbsolute } from 'node:path';
import { repositoryDocs } from '../src/lib/docs-loader';

test('repository docs use site-relative paths in the Astro content store', async () => {
  const loader = repositoryDocs();
  const paths: string[] = [];
  await loader.load({
    config: { root: new URL('../', import.meta.url) },
    store: {
      clear() {},
      set(entry: { filePath: string }) {
        expect(isAbsolute(entry.filePath)).toBe(false);
        expect(entry.filePath).not.toContain('\\');
        paths.push(entry.filePath);
      },
    },
    parseData: async ({ data }: { data: unknown }) => data,
    renderMarkdown: async () => ({ html: '<h1>Documentation</h1>' }),
    logger: { warn() {} },
  } as unknown as Parameters<typeof loader.load>[0]);
  expect(paths).toContain('../docs/install.md');
});
