import { expect, test } from 'bun:test';
import { sceneBrowserOptions } from '../browser-options.mjs';

test('scene browser defaults stay headless; explicit options and host GPU flags are preserved', () => {
  expect(sceneBrowserOptions({}, {})).toEqual({ headless: true, args: [] });
  const env = { KILN_SCENE_HEADED: '1', KILN_SCENE_CHROME_ARGS: '["--ozone-platform=x11","--enable-features=Vulkan"]' };
  expect(sceneBrowserOptions({}, env)).toEqual({ headless: false, args: ['--ozone-platform=x11', '--enable-features=Vulkan'] });
  expect(sceneBrowserOptions({ headless: true, args: ['--window-size=1280,720'] }, env)).toEqual({ headless: true, args: ['--ozone-platform=x11', '--enable-features=Vulkan', '--window-size=1280,720'] });
});

test('bad browser configuration fails before launching a browser or creating its profile', () => {
  for (const KILN_SCENE_HEADED of ['yes', '', 'true']) expect(() => sceneBrowserOptions({}, { KILN_SCENE_HEADED })).toThrow(/KILN_SCENE_HEADED/);
  for (const KILN_SCENE_CHROME_ARGS of ['--flag', '{}', '[1]', '["https://example.com"]', '["--flag\\u0000"]']) {
    expect(() => sceneBrowserOptions({}, { KILN_SCENE_CHROME_ARGS })).toThrow(/KILN_SCENE_CHROME_ARGS/);
  }
});
