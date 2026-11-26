import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RuntimeContext, type SceneRuntime } from '../../scene-kit/src/internal/runtime';
import { createInputApi } from '../../scene-kit/src/input';
import { HudLayer } from '../../scene-kit/src/ui';
import { TOWN_HUD_CSS, TownHud } from '../src/hud';
import { createSession } from '../src/session';

function renderHud() {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = (() => ({ matches: true })) as typeof matchMedia;
  const input = createInputApi();
  const runtime = { rootRef: { current: null }, input, playing: false, definition: { id: 'seed-town' },
    subscribe: () => () => {}, getSnapshot: () => 0, systems: { add: () => () => {} }, pack: null,
    setPlaying() {} } as unknown as SceneRuntime;
  try {
    return renderToStaticMarkup(<RuntimeContext.Provider value={runtime}><HudLayer><TownHud session={createSession()}/></HudLayer></RuntimeContext.Provider>);
  } finally { globalThis.matchMedia = previous; input.dispose(); }
}

test('the seed panel has a closed Seed button ahead of the toolbar that names the panel it opens', () => {
  const html = renderHud();
  const toggle = html.match(/<button type="button" aria-expanded="false" aria-controls="([^"]+)" class="ks-button st-seed-toggle[^"]*">Seed<\/button>/);
  expect(toggle).not.toBeNull();
  expect(html).toContain(`<section id="${toggle![1]}" aria-label="Town seed" class="ks-panel st-seed`);
  expect(html).not.toMatch(/class="ks-panel st-seed[^"]*" data-open/);
  expect(html.indexOf('st-seed-toggle')).toBeLessThan(html.indexOf('class="ks-toolbar'));
  expect(html).toContain('>Build</button>');
  expect(html).toContain('>New town</button>');
});

test('a narrow HUD folds the seed panel behind its button and keeps wrapped rows at the top', () => {
  // Wrapped HUD rows pack against the top edge; the default would spread them down the view.
  expect(TOWN_HUD_CSS).toMatch(/\.st-hud\{[^}]*align-content:flex-start/);
  const [wide, narrow] = TOWN_HUD_CSS.split('@container st-hud (max-width:560px){');
  expect(narrow).toBeDefined();
  expect(wide).toContain('.st-hud .st-seed-toggle{display:none}');
  const rule = narrow!.slice(0, narrow!.indexOf('\n}'));
  expect(rule).toContain('.st-hud .st-seed-toggle{display:inline-block;');
  expect(rule).toContain('.st-hud .st-seed:not([data-open]){display:none}');
});
