import { expect, test } from 'bun:test';
import { gameMaterial } from '../primitives';
import { pbrMaterial } from '../textures';

// Kiln takes "a CSS string" for a colour and hands it to three. three 0.186 read a negative hue or a decimal
// percentage as white, without a warning; r187 parses both (mrdoob/three.js#34849), so a source that wrote one now
// renders and exports the colour it named. Space-separated CSS Color 4 forms still read as white in r187.
test('a colour string with a negative hue or decimal percentages reads as authored', () => {
  expect(gameMaterial('hsl(-30, 60%, 50%)').color.getHexString()).toBe('cc3380');
  expect(pbrMaterial({ albedo: 'rgb(50.5%, 0%, 0%)' }).color.getHexString()).toBe('810000');
  expect(pbrMaterial({ emissive: 'hsl(-30, 60%, 50%)' }).emissive.getHexString()).toBe('cc3380');
});
