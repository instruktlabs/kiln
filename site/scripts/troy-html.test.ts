import { expect, test } from 'bun:test';
import { publicTroyHtml } from './troy-html.mjs';
import { embeddedDocumentErrors, inspectHtml } from './static-validation-core.mjs';

test('sealed Troy HTML is an unindexed embedded document with unchanged inline code', () => {
  const script = 'const a = "<input>";\nconsole.log(a);';
  const html = publicTroyHtml(Buffer.from('<!doctype html><title>Troy fixture</title><button id="attack">Attack</button><canvas aria-label="Pose"></canvas><pre aria-label="Receipt"></pre><script type="module">'+script+'</script>')).toString();
  expect(embeddedDocumentErrors(inspectHtml(html))).toEqual([]);
  expect(html).toStartWith('<!DOCTYPE html>');
  expect(html).toContain('type="button"');
  expect(html).toContain('role="img"');
  expect(html).toContain('role="log"');
  expect(html).toContain(script);
  expect(publicTroyHtml(Buffer.from(html)).toString()).toBe(html);
});
