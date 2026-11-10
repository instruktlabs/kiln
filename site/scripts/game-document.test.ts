import { expect, test } from 'bun:test';
import { gameDocumentErrors, isGameDocument, inspectHtml, headersErrors } from './static-validation-core.mjs';
import { readFileSync } from 'node:fs';
import { HtmlValidate } from 'html-validate';
import { gameHtmlValidationRules } from './static-validation-core.mjs';
test('compiled document permits lowercase doctype while retaining structural validation', async () => {
  const validator = new HtmlValidate({ extends: ['html-validate:recommended'], rules: gameHtmlValidationRules });
  const document = '<!doctype html><html lang="en"><head><title>H-7</title></head><body><div></div></body></html>';
  expect((await validator.validateString(document)).valid).toBe(true);
  expect((await validator.validateString(document.replace('<div></div>', '<div id="same"></div><div id="same"></div>'))).valid).toBe(false);
});
test('only the sealed H-7 launch route gets the independent document contract', () => {
  expect(isGameDocument('/play/h-7/')).toBe(true);
  for (const route of ['/play/', '/play/other/', '/play/h-7/source.html', '/scenes/h-7/']) expect(isGameDocument(route)).toBe(false);
});
test('noindex response headers allow the sealed game only, never the listing or other HTML', () => {
  const text = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const game = headersErrors({ text, files: ['play/h-7/index.html'] });
  expect(game.filter(error => error.includes('must not be served X-Robots-Tag'))).toEqual([]);
  const broad = text + '\n/play/*\n  X-Robots-Tag: noindex\n';
  expect(headersErrors({ text: broad, files: ['play/index.html'] }).some(error => error.includes('must not be served X-Robots-Tag'))).toBe(true);
});
test('game launch document requires title, English, own canonical, description and noindex', () => {
  const html = '<html lang="en"><head><title>H-7</title><meta name="description" content="Play H-7."><meta name="robots" content="noindex, follow"><link rel="canonical" href="https://kilnstudio.tools/play/h-7/"></head><body><canvas></canvas></body></html>';
  expect(gameDocumentErrors(inspectHtml(html))).toEqual([]);
  expect(gameDocumentErrors(inspectHtml(html.replace('noindex, follow', 'index, follow')))).toContain('Game launch document must be noindex');
  expect(gameDocumentErrors(inspectHtml(html.replace('https://kilnstudio.tools/play/h-7/', 'https://example.com/')))).toContain('Game launch canonical must be https://kilnstudio.tools/play/h-7/');
});
