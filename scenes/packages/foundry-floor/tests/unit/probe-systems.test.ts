// SPDX-License-Identifier: MIT
import { expect, test } from 'bun:test';
import { Object3D } from 'three';
import { foundryProbeAsset, foundryProbeSystems } from '../../src/campus/probe-systems';

const named = (name: string, parent?: Object3D) => { const o = new Object3D(); o.name = name; parent?.add(o); return o; };
const names = (systems: Record<string, Object3D[]>) => Object.fromEntries(Object.entries(systems).map(([k, v]) => [k, v.map(o => o.name)]));

test('exterior probe systems are the campus groups found by name, without the campus- prefix', () => {
  const scene = named('scene'), exterior = named('campus-exterior', scene);
  for (const name of ['campus-ground', 'campus-structures', 'campus-planting', 'campus-traffic']) named(name, exterior);
  named('campus-unlisted', exterior);
  expect(names(foundryProbeSystems(scene))).toEqual({ ground: ['campus-ground'], structures: ['campus-structures'], planting: ['campus-planting'], traffic: ['campus-traffic'] });
});

test('fab groups are grouped by entity role; unmapped groups keep their own name, with foundry-floor- shortened to fab-', () => {
  const scene = named('scene'), world = named('foundry-floor-world', scene);
  for (const name of ['wallKit:a:b', 'floorModule:1:2', 'tool:euv-scanner:3', 'loadPort:7:0', 'vehicle:sedan:1', 'foup:12:0', 'railStraight:4:1', 'foundry-floor-pulses', 'proxies:2:0', '']) named(name, world);
  named('campus-interior-context', scene);
  expect(names(foundryProbeSystems(scene))).toEqual({
    'interior-context': ['campus-interior-context'],
    'fab-building': ['wallKit:a:b', 'floorModule:1:2'], 'fab-tools': ['tool:euv-scanner:3', 'loadPort:7:0'], 'fab-movers': ['vehicle:sedan:1', 'foup:12:0'],
    'fab-transport': ['railStraight:4:1'], 'fab-pulses': ['foundry-floor-pulses'], 'proxies:2:0': ['proxies:2:0'], 'fab-unnamed': [''],
  });
});

test('fab assets are named by entity (tools by type) only for three-part names directly under the fab world', () => {
  const scene = named('scene'), world = named('foundry-floor-world', scene), elsewhere = named('campus-structures', scene);
  expect(foundryProbeAsset(named('tool:euv-scanner:3', world))).toBe('tool:euv-scanner');
  expect(foundryProbeAsset(named('wallKit:a:b', world))).toBe('wallKit');
  expect(foundryProbeAsset(named('tool:euv-scanner', world))).toBeNull();
  expect(foundryProbeAsset(named('tool:euv-scanner:3', elsewhere))).toBeNull();
  expect(foundryProbeAsset(named('wallKit:a:b'))).toBeNull();
});
