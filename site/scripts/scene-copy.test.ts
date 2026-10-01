import { describe, expect, test } from 'bun:test';
import { farmScene, farmTouchCopy } from '../src/data/scenes';

// The current revision has desktop and emulated-touch functional checks. Earlier
// physical-device measurements must remain historical rather than qualify new bytes.
const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const touchText = strings(farmTouchCopy).join('\n');

describe('Farm touch copy', () => {
  test('describes first-person touch walking and mode-specific tractor zoom', () => {
    expect(touchText).toMatch(/joystick/i);
    expect(touchText).toMatch(/push it forward to accelerate/);
    expect(touchText).toMatch(/pull it back to brake/);
    expect(touchText).toMatch(/once stopped, to reverse/);
    expect(touchText).toMatch(/[Dd]rag one finger to look/);
    expect(touchText).toMatch(/[Pp]inch to zoom/);
    expect(touchText).toMatch(/One tap target/);
    expect(touchText).toMatch(/first person/);
    expect(touchText).toMatch(/[Pp]inch to zoom.*(?:tractor|driving)/);
    expect(touchText).toMatch(/Walking keeps a fixed eye height/);
  });

  test('distinguishes automatic device tiers from historical measurements', () => {
    expect(touchText).toMatch(/Galaxy S24\+ class starts on the high tier when its browser uses WebGPU/);
    expect(touchText).toMatch(/Galaxy Tab S9 FE class starts on the minimal tier on either graphics backend/);
    expect(touchText).toMatch(/earlier.*Galaxy Tab S9 FE/i);
    expect(touchText).toMatch(/do not qualify this revision/);
  });

  test('does not promote old step counts or timing into the current result', () => {
    expect(touchText).not.toMatch(/all 16|meets its frame-time target/);
    expect(touchText).not.toMatch(/\b(?:fps|frames per second|milliseconds?|ms)\b/i);
  });

  test('promises nothing for a device that was not measured', () => {
    expect(touchText).toMatch(/No physical phone or tablet has been measured for this revision/);
    expect(touchText).not.toMatch(/\b(?:any|all|every) (?:phones?|tablets?|devices?)\b/i);
    expect(touchText).not.toMatch(/guarantee|works on|smooth on|runs on/i);
  });

  test('says the current checks used touch emulation on both backends', () => {
    expect(touchText).toMatch(/with touch emulation/);
    expect(touchText).toMatch(/WebGPU and WebGL2/);
  });
});

describe('Farm scene device line and download limits', () => {
  test('the line under Explore offers touch play, not orbit viewing only', () => {
    expect(farmScene.copy.devices).toMatch(/[Tt]ouch play/);
    expect(farmScene.copy.devices).not.toMatch(/orbit/i);
    expect(farmScene.copy.devices).toMatch(/qualification notes are listed below/);
    expect(farmScene.copy.devices).not.toMatch(/phones? and tablets?/i);
    expect(farmScene.copy.devices).not.toMatch(/\d/);
  });

  test('the current download supports touch play without inheriting performance claims', () => {
    expect(farmScene.mobile).toMatch(/touch.*walking.*driving/i);
    expect(farmScene.mobile).not.toMatch(/only/);
    expect(farmScene.exclusions).not.toMatch(/mobile walking|mobile driving/);
    expect(farmScene.exclusions).toMatch(/not included/);
  });
});
