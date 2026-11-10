import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RuntimeContext, type SceneRuntime } from '../../scene-kit/src/internal/runtime';
import { createInputApi } from '../../scene-kit/src/input';
import { HudLayer } from '../../scene-kit/src/ui';
import { SquareHud } from '../src/hud';
import { VIEWPOINTS } from '../src/viewpoints';

function renderHud(playing = false, coarse = false) {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = (() => ({ matches: coarse })) as typeof matchMedia;
  const input = createInputApi();
  const runtime = { rootRef: { current: null }, input, playing, definition: { id: 'cathedral-square' },
    subscribe: () => () => {}, getSnapshot: () => 0, systems: { add: () => () => {} }, pack: null,
    setPlaying() {} } as unknown as SceneRuntime;
  try {
    return renderToStaticMarkup(<RuntimeContext.Provider value={runtime}><HudLayer><SquareHud/></HudLayer></RuntimeContext.Provider>);
  } finally { globalThis.matchMedia = previous; input.dispose(); }
}

test('the first frame has folded View and More groups, a visible walk action and no camera pad', () => {
  const html = renderHud();
  expect(html.match(/data-collapse="always"/g)).toHaveLength(2);
  expect(html).not.toContain('data-open');
  expect(html).toContain('>Walk the square</button>');
  expect(html).toContain('aria-label="View"');
  expect(html).toContain('aria-label="More"');
  expect(html).toContain('>Reset view</button>');
  expect(html).toContain('>Camera controls</button>');
  expect(html).not.toContain('class="ks-panel sq-camera"');
  expect(html).toContain('>Credits</button>');
  expect(html).toContain('aria-label="Hide controls"');
  expect(html).toContain('role="status" aria-live="polite"');
  for (const view of VIEWPOINTS) expect(html).toContain(`value="${view.id}"`);
});

test('coarse-pointer layout works before first touch and keeps only walking controls in play', () => {
  const overview = renderHud(false, true), walking = renderHud(true, true);
  expect(overview).toContain('sq-touch');
  expect(overview).not.toContain('>Camera controls</button>');
  expect(overview).toContain('>Reset view</button>');
  expect(walking).toContain('>Back to the view</button>');
  expect(walking).toContain('class="ks-joystick"');
  expect(walking).not.toContain('aria-label="Cathedral viewpoint"');
  expect(walking).not.toContain('aria-label="View"');
  expect(walking).toContain('>More<span');
});
