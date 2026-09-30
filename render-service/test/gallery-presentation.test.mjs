import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getPresentationPreset,
  DEFAULT_PRESENTATION_PRESET_ID,
} from '../src/presentation-presets.mjs';
test('gallery profile retains the v1 lights and exposure independently of the new default', () => {
  const original = getPresentationPreset('neutral-studio-v1');
  const gallery = getPresentationPreset('gallery-studio-v1');
  assert.ok(gallery, 'gallery profile must be selectable');
  assert.equal(DEFAULT_PRESENTATION_PRESET_ID, 'review-neutral-v1');
  assert.equal(original.exposure, 1.38);
  assert.deepEqual(gallery, {
    ...original,
    id: 'gallery-studio-v1',
    exposure: 0.9,
  });
  assert.ok(Object.isFrozen(gallery));
});
