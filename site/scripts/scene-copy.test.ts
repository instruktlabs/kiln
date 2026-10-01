import { describe, expect, test } from 'bun:test';
import { farmScene, farmTouchCopy } from '../src/data/scenes';

// The current revision has desktop and emulated-touch functional checks. Earlier
// physical-device measurements must remain historical rather than qualify new bytes.
const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const touchText = strings(farmTouchCopy).join('\n');

describe('Farm touch copy', () => {
  test('describes third-person touch walking with pinch zoom on foot and in the tractor', () => {
    expect(touchText).toMatch(/joystick/i);
    expect(touchText).toMatch(/push it forward to accelerate/);
    expect(touchText).toMatch(/pull it back to brake/);
    expect(touchText).toMatch(/once stopped, to reverse/);
    expect(touchText).toMatch(/[Dd]rag one finger to look/);
    expect(touchText).toMatch(/[Pp]inch to zoom/);
    expect(touchText).toMatch(/One tap target/);
    expect(touchText).toMatch(/third person/);
    expect(touchText).not.toMatch(/first person|fixed eye height/);
    expect(touchText).toMatch(/[Pp]inch to zoom.*(?:tractor|driving)/);
  });

  test('describes the automatic device tiers', () => {
    expect(touchText).toMatch(/Galaxy S24\+ class starts on the high tier when its browser uses WebGPU/);
    expect(touchText).toMatch(/Galaxy Tab S9 FE class starts on the minimal tier on either graphics backend/);
  });

  test('does not promote old step counts or timing into the current result', () => {
    expect(touchText).not.toMatch(/all 16|meets its frame-time target/);
    expect(touchText).not.toMatch(/\b(?:fps|frames per second|milliseconds?|ms)\b/i);
  });

  test('promises nothing for a device that was not measured', () => {
    expect(touchText).not.toMatch(/\b(?:any|all|every) (?:phones?|tablets?|devices?)\b/i);
    expect(touchText).not.toMatch(/guarantee|works on|smooth on|runs on/i);
  });

  test('carries no qualification or review-status notes', () => {
    expect(touchText).not.toMatch(/qualif|touch emulation|owner review|has been measured/i);
  });
});

describe('Farm scene device line and download limits', () => {
  test('the line under Explore offers touch play, not orbit viewing only', () => {
    expect(farmScene.copy.devices).toMatch(/[Tt]ouch play/);
    expect(farmScene.copy.devices).not.toMatch(/orbit/i);
    expect(farmScene.copy.devices).not.toMatch(/qualif/i);
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
