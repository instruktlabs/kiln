import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('consumer guides include the documentation they link to in the package', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const guides = manifest.files.filter((path) => path.startsWith('docs/'));
  for (const guide of guides) {
    const source = new URL(guide, new URL('../', import.meta.url));
    const body = await readFile(source, 'utf8');
    for (const [, href] of body.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z]+:|\/|#)/i.test(href)) continue;
      const target = relative(root, fileURLToPath(new URL(href, source))).replaceAll('\\', '/');
      if (!target.startsWith('docs/') || !target.endsWith('.md')) continue;
      expect(guides, `${guide} links to unpackaged guide ${target}`).toContain(target);
    }
  }
});
