import { expect, test } from 'bun:test';
import { initialChunkRoles } from '../tools/build-campus';

test('initial campus payload includes exterior dependencies but defers the twin and its private dependencies', () => {
  const roles = initialChunkRoles([
    { fileName: 'entry.js', isEntry: true, imports: ['common.js'], modules: {} },
    { fileName: 'common.js', isEntry: false, imports: [], modules: {} },
    { fileName: 'exterior.js', isEntry: false, imports: ['common.js', 'road.js'], modules: { '/x/packages/foundry-floor/src/campus/exterior/index.ts': {} } },
    { fileName: 'road.js', isEntry: false, imports: [], modules: {} },
    { fileName: 'interior.js', isEntry: false, imports: ['common.js', 'twin.js'], modules: { '/x/packages/foundry-floor/src/campus/interior.tsx': {} } },
    { fileName: 'twin.js', isEntry: false, imports: [], modules: {} },
  ]);
  expect([...roles]).toEqual([['entry.js', 'startup'], ['common.js', 'startup'], ['exterior.js', 'exterior'], ['road.js', 'exterior'], ['interior.js', 'interior'], ['twin.js', 'interior']]);
});
