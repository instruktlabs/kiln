// Known lines remain in the report. Unknown messages and incomplete evidence fail closed.
const KNOWN_WARNINGS = [/^THREE\.Clock: This module has been deprecated/];
const UNSUPPORTED_BLUETOOTH = "Error with Permissions-Policy header: Unrecognized feature: 'bluetooth'.";

function unsupportedBluetooth(entry, environment) {
  // Chrome documents Linux Bluetooth support behind an experimental flag:
  // https://developer.chrome.com/docs/capabilities/bluetooth
  // features() enumerates supported policy features; allowedFeatures() would only
  // show what this document's policy permits and cannot prove lack of support.
  if (entry.type !== 'warn' || entry.text !== UNSUPPORTED_BLUETOOTH
    || !/^Chrome\/\d+\./.test(environment?.browser ?? '')
    || !/^Linux\b/.test(environment?.platform ?? '')
    || environment?.secureContext !== true || environment?.bluetoothApiPresent !== false
    || !Array.isArray(environment?.supportedPolicyFeatures)
    || environment.supportedPolicyFeatures.includes('bluetooth')
    || typeof environment?.permissionsPolicy !== 'string') return false;
  const directives = environment.permissionsPolicy.split(',').map((value) => value.trim())
    .filter((value) => /^bluetooth(?:\s|=|$)/.test(value));
  return directives.length === 1 && /^bluetooth\s*=\s*\(\s*\)$/.test(directives[0]);
}

export function classifyExploreConsole(entries, environment) {
  const flagged = entries.filter((entry) => entry.scenario === 'explore' && ['error', 'warn', 'warning'].includes(entry.type));
  const isKnown = (entry) => KNOWN_WARNINGS.some((pattern) => pattern.test(entry.text)) || unsupportedBluetooth(entry, environment);
  return { known: flagged.filter(isKnown), unexpected: flagged.filter((entry) => !isKnown(entry)) };
}
