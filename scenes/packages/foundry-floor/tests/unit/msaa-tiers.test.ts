// SPDX-License-Identifier: MIT
import { expect, test } from 'bun:test';
import { resolveTier } from '@kiln-scenes/scene-kit';
import type { DeviceClass } from '@kiln-scenes/scene-kit';
import { foundryFloorDefinition } from '../../src/definition';

test('OD-10: every tier discards the canvas pass 4x attachments (no viewport-texture node or transmission splits the pass)', () => {
  const tiers = foundryFloorDefinition.tiers;
  for (const form of ['desktop', 'phone'] as const) {
    const device: DeviceClass = { form, backend: 'webgpu', gpu: 'high', devicePixelRatio: 1 };
    for (const name of tiers.order) expect(resolveTier(tiers, name, device).multisample).toEqual({ discard: true });
  }
});
