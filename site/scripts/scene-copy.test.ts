import { describe, expect, test } from 'bun:test';
import { farmScene, farmTouchCopy } from '../src/data/scenes';

// The Farm's phone and tablet copy is written from the scene's own records (D-11): the mobile-play check passes all 16
// steps on each graphics backend, the tablet's frame-time check passes on a Galaxy Tab S9 FE at the minimal tier, and a
// phone of the Galaxy S24+ class starts on the high tier. These tests keep the copy inside those facts.
const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const touchText = strings(farmTouchCopy).join('\n');

describe('Farm touch copy', () => {
  test('describes the touch scheme: joystick, driving, drag look, pinch zoom, one tap target, third person', () => {
    expect(touchText).toMatch(/joystick/i);
    expect(touchText).toMatch(/push it forward to accelerate/);
    expect(touchText).toMatch(/pull it back to brake/);
    expect(touchText).toMatch(/once stopped, to reverse/);
    expect(touchText).toMatch(/[Dd]rag one finger to look/);
    expect(touchText).toMatch(/[Pp]inch to zoom/);
    expect(touchText).toMatch(/One tap target/);
    expect(touchText).toMatch(/third person/);
  });

  test('pairs each measured device class with its tier', () => {
    expect(touchText).toMatch(/Galaxy S24\+ class starts on the high tier when its browser uses WebGPU/);
    expect(touchText).toMatch(/Galaxy Tab S9 FE class starts on the minimal tier on either graphics backend/);
    expect(touchText).toMatch(/Galaxy Tab S9 FE, at the minimal tier/);
  });

  test('uses the number of the mobile-play check and no other number', () => {
    // Device and backend names carry digits; take them out, and what is left may be the check's 16 steps only.
    const numbers = touchText.replace(/S24\+|S9 FE|WebGL2|WebGPU/g, '').match(/\d+(?:[.,]\d+)*/g);
    expect(numbers).toEqual(['16']);
    expect(touchText).not.toMatch(/\b(?:fps|frames per second|milliseconds?|ms)\b/i);
  });

  test('promises nothing for a device that was not measured', () => {
    expect(touchText).toMatch(/No other phone or tablet has been measured/);
    expect(touchText).not.toMatch(/\b(?:any|all|every) (?:phones?|tablets?|devices?)\b/i);
    expect(touchText).not.toMatch(/guarantee|works on|smooth on|runs on/i);
  });

  test('says what the checks were: emulation on both backends, real touch on the tablet', () => {
    expect(touchText).toMatch(/with touch emulation/);
    expect(touchText).toMatch(/real touch on a Galaxy Tab S9 FE/);
  });
});

describe('Farm scene device line and download limits', () => {
  test('the line under Explore offers touch play, not orbit viewing only', () => {
    expect(farmScene.copy.devices).toMatch(/[Tt]ouch play/);
    expect(farmScene.copy.devices).not.toMatch(/orbit/i);
    // It says what was measured is listed, and does not name device classes it did not measure.
    expect(farmScene.copy.devices).toMatch(/devices measured are listed below/);
    expect(farmScene.copy.devices).not.toMatch(/phones? and tablets?/i);
    expect(farmScene.copy.devices).not.toMatch(/\d/);
  });

  test('the orbit-only limit is stated about the download, which is what it describes', () => {
    expect(farmScene.mobile).toMatch(/^In the download, mobile supports orbit viewing only\.$/);
    expect(farmScene.exclusions).toMatch(/not included/);
  });
});
