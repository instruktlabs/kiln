import assert from 'node:assert/strict';

const position = value => Array.isArray(value) && value.length >= 3 && value.every(Number.isFinite);
const freightKind = name => /^traffic-truck-tractor-lod\d$/.test(name) ? 'tractor' : /^traffic-trailer-(dryvan|flatbed|tanker)-lod\d$/.test(name) ? 'trailer' : null;

export function assertPositionMotion(before, after, minimum = 0.05) {
  assert.ok(before?.subject && before.subject === after?.subject, 'Movement must observe the same subject');
  assert.ok(position(before.position) && position(after.position), 'Movement requires finite observed positions');
  const metres = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
  assert.ok(metres > minimum, `No meaningful horizontal movement: ${metres} m`);
  return metres;
}

export function assertPanelObservation(panel) {
  assert.ok(panel?.rect && panel.root && panel.hitWithin, 'Panel must receive touches above the scene');
  for (const rect of [panel.rect, panel.root]) {
    assert.ok(['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(rect[key])), 'Panel bounds missing');
    assert.ok(rect.right > rect.left && rect.bottom > rect.top, 'Panel must have an area');
  }
  assert.ok(panel.rect.left >= panel.root.left - 1 && panel.rect.right <= panel.root.right + 1 && panel.rect.top >= panel.root.top - 1 && panel.rect.bottom <= panel.root.bottom + 1, 'Panel is clipped outside the scene');
  assert.ok(['scrollHeight', 'clientHeight', 'scrollBefore', 'scrollAfter'].every(key => Number.isFinite(panel[key])) && panel.clientHeight > 0, 'Panel scroll observations missing');
  if (panel.scrollHeight > panel.clientHeight + 2) assert.ok(panel.scrollAfter > panel.scrollBefore + 1, 'Overflowing panel did not scroll under real touch');
}

export function assertControlBackend(requested, observed, headed) {
  assert.equal(headed, true, 'Live control qualification requires a headed browser');
  assert.ok(['webgpu', 'webgl2'].includes(requested), 'Explicit backend required');
  assert.equal(observed?.backend, requested, 'Rendered backend differs from requested backend');
  let identity;
  if (requested === 'webgpu') {
    assert.equal(observed.gpu?.status, 'bound', 'Actual canvas device must be bound to its adapter');
    assert.deepEqual(observed.gpu.errors, []);
    identity = Object.values(observed.gpu.adapter ?? {}).filter(value => typeof value === 'string').join(' ').trim();
  } else identity = observed.glRenderer;
  assert.ok(typeof identity === 'string' && identity.trim(), 'Renderer hardware identity missing');
  assert.doesNotMatch(identity, /swiftshader|llvmpipe|lavapipe|software|microsoft basic render/i, 'Software renderer cannot qualify live hardware controls');
}

/** Visible instance-buffer changes only; no individual vehicle identity or fifth-wheel alignment claim. */
export function movingFreightKinds(before, after) {
  const moved = new Set();
  for (const row of after ?? []) {
    const kind = freightKind(row.name);
    if (!kind) continue;
    const previous = before?.find(candidate => candidate.name === row.name);
    if (row.positions?.some((value, index) => position(value) && position(previous?.positions?.[index]) && Math.hypot(value[0] - previous.positions[index][0], value[2] - previous.positions[index][2]) > 0.05)) moved.add(kind);
  }
  return ['tractor', 'trailer'].filter(kind => moved.has(kind));
}

export function visibleFreightKinds(rows) {
  const kinds = new Set((rows ?? []).filter(row => row.positions?.some(position)).map(row => freightKind(row.name)));
  return ['tractor', 'trailer'].filter(kind => kinds.has(kind));
}

/** Public FF campus gestures, derived from its sealed The split preset and road span.
 * Pixel deltas follow the pinned OrbitControls defaults. Readback, not the plan,
 * establishes that a real browser gesture reached the requested camera pose.
 */
export function freightScanPlan(canvas, camera) {
  assert.ok(canvas && Number.isFinite(canvas.width) && Number.isFinite(canvas.height) && canvas.width > 80 && canvas.height > 80, 'Freight scan requires measured canvas dimensions');
  assert.ok(position(camera?.position) && position(camera.forward) && camera.fov === 50, 'Freight scan requires The split camera and projection');
  const target = [-2400, 35, 0], offset = camera.position.map((value, index) => value - target[index]);
  const radius = Math.hypot(...offset);
  assert.ok(Math.abs(camera.position[0] + 3917.012466228799) < 2 && Math.abs(camera.position[1] - 142.57870284779813) < 2 && Math.abs(camera.position[2]) < 2, 'The split public view was not applied');
  assert.ok(Math.hypot(...camera.forward.map((value, index) => value + offset[index] / radius)) < 0.002, 'The split camera points away from its target');
  const distance = 500, halfFov = Math.tan(camera.fov * Math.PI / 360), stepMetres = 160;
  assert.ok(stepMetres < 2 * distance * halfFov * canvas.width / canvas.height, 'Canvas is too narrow for the bounded freight sweep');
  const pixels = (metres, at) => metres * canvas.height / (2 * at * halfFov);
  // Raise the orbit before panning: the sweep crosses 70m front fins and the
  // public rig keeps six metres clear of grounded solids on every input frame.
  const polar = Math.acos(offset[1] / radius) - Math.PI / 50;
  return { rotatePixels: canvas.height / 4, rotateYPixels: canvas.height / 100, panWestPixels: pixels(-1800, radius),
    wheelDelta: -100 * Math.log(distance / radius) / Math.log(0.95), scanPanPixels: pixels(stepMetres, distance),
    startPosition: [-4200, target[1] + Math.cos(polar) * distance, -Math.sin(polar) * distance],
    forward: [0, -Math.cos(polar), Math.sin(polar)], stepMetres, maxPositions: 55 };
}

export function assertFreightScanCamera(camera, plan, step) {
  assert.ok(Number.isInteger(step) && step >= 0 && step < plan.maxPositions, 'Freight scan step exceeds its bound');
  assert.ok(position(camera?.position) && position(camera.forward) && camera.fov === 50, 'Freight scan camera evidence missing');
  const expected = plan.startPosition.map((value, index) => value + (index === 0 ? step * plan.stepMetres : 0));
  assert.ok(Math.hypot(...camera.position.map((value, index) => value - expected[index])) < 4, `Public freight gesture missed corridor step ${step}: ${camera.position}`);
  assert.ok(Math.hypot(...camera.forward.map((value, index) => value - plan.forward[index])) < 0.004, 'Public freight gesture changed the viewing direction');
}
