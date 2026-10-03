import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HUD_CSS, HudButton, HudHideButton, HudLayer, HudMenu, HudToolbar } from '../../src/ui';

test('a HUD menu keeps its options in the document behind one labelled trigger', () => {
  const html = renderToStaticMarkup(<HudToolbar>
    <HudMenu label="View" value="Day" collapse="narrow"><HudButton>Day</HudButton><HudButton>Fog</HudButton></HudMenu>
    <HudMenu label="More"><HudButton>Credits</HudButton></HudMenu>
  </HudToolbar>);
  expect(html).toContain('class="ks-toolbar');
  // Closed by default; the trigger names the group and shows the current value.
  expect(html).toMatch(/<div class="ks-menu[^"]*" data-collapse="narrow">/);
  expect(html).toMatch(/<div class="ks-menu[^"]*" data-collapse="always">/);
  expect(html).not.toContain('data-open');
  expect(html).toMatch(/<button type="button" aria-expanded="false" aria-controls="[^"]+" aria-label="View: Day" class="ks-button ks-menu-trigger[^"]*">Day/);
  expect(html).toMatch(/aria-label="More" class="ks-button ks-menu-trigger[^"]*">More/);
  expect(html).toMatch(/<div id="[^"]+" class="ks-menu-items" role="group" aria-label="View">.*Day.*Fog/);
  for (const label of ['Day', 'Fog', 'Credits']) expect(html).toContain(`>${label}</button>`);
});

test('the HUD layer offers Hide and renders Show controls only once hidden', () => {
  const html = renderToStaticMarkup(<HudLayer><HudToolbar><HudHideButton/></HudToolbar></HudLayer>);
  expect(html).toMatch(/^<div class="ks-hud[^"]*">/);
  expect(html).toMatch(/<button type="button" class="ks-button ks-hud-hide" aria-label="Hide controls" data-ks-preserve-path="">Hide<\/button>/);
  expect(html).not.toContain('Show controls'); expect(html).not.toContain('data-ks-hidden');
});

test('the kit stylesheet collapses menus by the HUD width and keeps touch controls while hidden', () => {
  expect(HUD_CSS).toContain('.ks-hud{position:absolute;inset:0;pointer-events:none;z-index:2;container:ks-hud/inline-size;contain:layout}');
  expect(HUD_CSS).toMatch(/@container ks-hud \(max-width:\d+px\)\{[^@]*\.ks-menu\[data-collapse=narrow\]/);
  expect(HUD_CSS).toContain('.ks-hud[data-ks-hidden]>:not(.ks-hud-show){visibility:hidden}');
  expect(HUD_CSS).toContain('.ks-hud[data-ks-hidden] :is(.ks-joystick,.ks-touch-buttons){visibility:visible}');
});
