import { expect, test } from 'bun:test';
import { classifyExploreConsole } from './scene-console.mjs';

const text = "Error with Permissions-Policy header: Unrecognized feature: 'bluetooth'.";
const warning = { scenario: 'explore', type: 'warn', text };
const observed = {
  browser: 'Chrome/150.0.7871.128',
  platform: 'Linux x86_64',
  secureContext: true,
  bluetoothApiPresent: false,
  supportedPolicyFeatures: ['camera', 'geolocation', 'fullscreen'],
  permissionsPolicy: 'camera=(), microphone=(), bluetooth=(), geolocation=()',
};

test('retains the exact unsupported Bluetooth warning as known only with observed browser and deny-header evidence', () => {
  const entries = [warning];
  const result = classifyExploreConsole(entries, observed);
  expect(result).toEqual({ known: [warning], unexpected: [] });
  expect(result.known[0]).toBe(warning);
  expect(entries).toEqual([warning]);
});

test('missing or contradictory browser support evidence never excuses a policy warning', () => {
  for (const environment of [
    undefined,
    {},
    { ...observed, browser: undefined },
    { ...observed, browser: 'Firefox/150.0' },
    { ...observed, platform: undefined },
    { ...observed, platform: 'Win32' },
    { ...observed, secureContext: false },
    { ...observed, secureContext: undefined },
    { ...observed, bluetoothApiPresent: true },
    { ...observed, bluetoothApiPresent: undefined },
    { ...observed, supportedPolicyFeatures: null },
    { ...observed, supportedPolicyFeatures: undefined },
    { ...observed, supportedPolicyFeatures: ['camera', 'bluetooth'] },
  ]) expect(classifyExploreConsole([warning], environment)).toEqual({ known: [], unexpected: [warning] });
});

test('the served header must declare exactly one empty Bluetooth allowlist', () => {
  for (const permissionsPolicy of [undefined, null, '', 'camera=()', 'bluetooth=*', 'bluetooth=(self)', 'bluetooth', 'bluetooth=(), bluetooth=*', 'bluetooth=(), bluetooth=()', 'not-bluetooth=()']) {
    expect(classifyExploreConsole([warning], { ...observed, permissionsPolicy })).toEqual({ known: [], unexpected: [warning] });
  }
});

test('only the exact Puppeteer warn message is classified, never errors or other warnings', () => {
  for (const entry of [
    { ...warning, type: 'error' },
    { ...warning, type: 'warning' },
    { ...warning, text: text.replace('bluetooth', 'camera') },
    { ...warning, text: `${text} Other failure` },
    { ...warning, text: 'Unknown policy error' },
  ]) expect(classifyExploreConsole([entry], observed)).toEqual({ known: [], unexpected: [entry] });
});

test('existing upstream Clock reporting and unexpected Explore failures remain intact', () => {
  const clock = { scenario: 'explore', type: 'warn', text: 'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.' };
  const error = { scenario: 'explore', type: 'error', text: 'Scene failed' };
  const injected = { scenario: 'pack-unavailable', type: 'error', text: 'Intentional failed request' };
  expect(classifyExploreConsole([clock, error, injected], observed)).toEqual({ known: [clock], unexpected: [error] });
});
