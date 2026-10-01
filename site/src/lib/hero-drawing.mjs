/**
 * The home hero drawing, computed from the hero data file (`src/data/hero.json`) and nothing else: the revision's
 * bounding box and each callout part's bounds centre are projected through the poster's capture camera, the X, Z
 * and height dimensions are drawn along the projected box edges, the leaders leave each part at 40 degrees and then
 * run level, and every label is placed in free space using the poster's silhouette mask. Swapping the data file
 * redraws the figure; `scripts/hero-drawing.test.ts` checks it with the Golden Gate Bridge and the farmhouse.
 *
 * Coordinates are the poster's own pixels (x right, y down). Text is laid out at a fixed size in CSS pixels, so its
 * extent in poster pixels depends on the rendered width: chips are fitted at the narrowest drawing (`chipWidthPx`)
 * and callout labels at the narrowest width that shows them in the drawing (`labelWidthPx`; below it they become a
 * numbered legend under the figure).
 */

export const TEXT = { charPx: 7.2, padPx: 4, heightPx: 16, gapPx: 6 };
export const LAYOUT = { chipWidthPx: 280, labelWidthPx: 420, gap: 44, overshoot: 10, tick: 7, margin: 10, level: 24 };
const LEADER_ANGLE = (40 * Math.PI) / 180;

const sub = (a, b) => a.map((value, index) => value - b[index]);
const add = (a, b) => a.map((value, index) => value + b[index]);
const scale = (a, factor) => a.map((value) => value * factor);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(...a);
const unit = (a) => scale(a, 1 / length(a));
const round = (point) => point.map((value) => Math.round(value * 10) / 10);

/** Project world points to poster pixels the way the engine's camera does (orthographic or perspective). */
export function projector(camera, width, height) {
  const back = unit(sub(camera.position, camera.target));
  const right = unit(cross(camera.up ?? [0, 1, 0], back));
  const up = cross(back, right);
  const aspect = width / height;
  return (point) => {
    const offset = sub(point, camera.target);
    let x = dot(offset, right);
    let y = dot(offset, up);
    let halfHeight = camera.halfHeight;
    if (camera.projection !== 'orthographic') {
      const depth = length(sub(camera.position, camera.target)) - dot(offset, back);
      halfHeight = depth * Math.tan(((camera.fovDeg ?? 50) * Math.PI) / 360);
    }
    x /= halfHeight * aspect;
    y /= halfHeight;
    return [((x + 1) / 2) * width, ((1 - y) / 2) * height];
  };
}

/** The silhouette mask: `cells` x `cells` bits, row major, base64. `occupied(x, y)` takes poster pixels. */
export function decodeMask(mask, width, height) {
  const bytes = typeof Buffer !== 'undefined' ? Buffer.from(mask.bits, 'base64') : Uint8Array.from(atob(mask.bits), (c) => c.charCodeAt(0));
  const bit = (column, row) => column >= 0 && row >= 0 && column < mask.cells && row < mask.cells && (bytes[(row * mask.cells + column) >> 3] >> (7 - ((row * mask.cells + column) & 7))) & 1;
  const cellWidth = width / mask.cells;
  const cellHeight = height / mask.cells;
  return {
    occupied: (x, y) => Boolean(bit(Math.floor(x / cellWidth), Math.floor(y / cellHeight))),
    /** Any occupied cell inside the box, grown by `pad` poster pixels. */
    boxOccupied: ([x0, y0, x1, y1], pad = 0) => {
      for (let row = Math.floor((y0 - pad) / cellHeight); row <= Math.floor((y1 + pad) / cellHeight); row++) {
        for (let column = Math.floor((x0 - pad) / cellWidth); column <= Math.floor((x1 + pad) / cellWidth); column++) if (bit(column, row)) return true;
      }
      return false;
    },
  };
}

/** "2,067.96 m": the bounds in metres, two decimals, as the rest of the site prints them. */
export const metres = (value) => `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

/** Text extent in poster pixels at a rendered drawing width. */
const textExtent = (text, width, renderedPx) => {
  const factor = width / renderedPx;
  return [(text.length * TEXT.charPx + 2 * TEXT.padPx) * factor, TEXT.heightPx * factor];
};

/** The corners of a rotated box (centre, half extents along `along` and its normal) as an axis-aligned box. */
function orientedBounds(centre, along, halfAlong, halfAcross) {
  const normal = [-along[1], along[0]];
  const corners = [
    add(centre, add(scale(along, halfAlong), scale(normal, halfAcross))),
    add(centre, add(scale(along, halfAlong), scale(normal, -halfAcross))),
    add(centre, add(scale(along, -halfAlong), scale(normal, halfAcross))),
    add(centre, add(scale(along, -halfAlong), scale(normal, -halfAcross))),
  ];
  return [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1]))];
}

const boxesOverlap = (a, b, pad = 0) => a[0] - pad < b[2] && b[0] - pad < a[2] && a[1] - pad < b[3] && b[1] - pad < a[3];
const inside = (box, width, height, margin) => box[0] >= margin && box[1] >= margin && box[2] <= width - margin && box[3] <= height - margin;

function segmentsCross(p1, p2, q1, q2) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q1, q2, p1);
  const d2 = d(q1, q2, p2);
  const d3 = d(p1, p2, q1);
  const d4 = d(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function segmentHitsBox(a, b, box) {
  if ([a, b].some(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3])) return true;
  const corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
  return corners.some((corner, index) => segmentsCross(a, b, corner, corners[(index + 1) % 4]));
}

/** Screen angle of a direction, turned so text along it reads left to right (a vertical line reads upward). */
const readingAngle = (direction) => {
  let angle = (Math.atan2(direction[1], direction[0]) * 180) / Math.PI;
  if (angle > 90.5) angle -= 180;
  if (angle <= -90.5) angle += 180;
  if (Math.abs(angle - 90) < 0.5) angle = -90;
  return Math.round(angle * 10) / 10;
};

/**
 * One dimension: the box edge from `a` to `b` (world), pushed outward along the world direction `outward` until
 * it clears the edge by `gap` poster pixels, with extension lines back to the corners, 45 degree ticks and a chip.
 *
 * The chip is fitted at the narrowest drawing (`chipWidthPx`) and must stay inside the frame: on the line when it
 * fits between the ticks (the line moves in towards the box, down to half its gap, when the frame edge is too close);
 * otherwise beside the line, on the outer side first, slid along the line as far as the frame needs and clear of the
 * silhouette.
 */
function dimension({ axis, value, a, b, outward, project, width, height, mask }) {
  const start = project(a);
  const end = project(b);
  const along = unit(sub(end, start));
  let push = unit(sub(project(add(a, outward)), start));
  const sine = Math.abs(along[0] * push[1] - along[1] * push[0]);
  if (sine < 0.3) push = scale([-along[1], along[0]], Math.sign(dot([-along[1], along[0]], push)) || 1);
  const ideal = LAYOUT.gap / Math.max(sine, 0.3);
  const angle = readingAngle(along);
  const reading = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
  const normal = [-reading[1], reading[0]];
  const outerSign = Math.sign(dot(normal, push)) || 1;
  const [chipLong, chipHigh] = textExtent(value, width, LAYOUT.chipWidthPx);
  const chipGap = (TEXT.gapPx * width) / LAYOUT.chipWidthPx;
  const span = length(sub(end, start));
  const sides = [outerSign, -outerSign].map((sideSign) => ({ place: sideSign > 0 ? 'below' : 'above', sideSign }));
  const candidates = chipLong + 3 * LAYOUT.tick <= span ? [{ place: 'on', sideSign: 0 }, ...sides] : sides;
  const slides = [0];
  for (let slide = 4; slide <= span / 2 + chipLong / 2; slide += 4) slides.push(slide, -slide);
  const layout = (shift, { place, sideSign }, slide) => {
    const offset = scale(push, shift);
    const line = [add(start, offset), add(end, offset)];
    const middle = add(scale(add(line[0], line[1]), 0.5), scale(reading, slide));
    const centre = place === 'on' ? middle : add(middle, scale(normal, sideSign * (chipHigh / 2 + chipGap)));
    return { shift, line, at: middle, place, box: orientedBounds(centre, reading, chipLong / 2, chipHigh / 2) };
  };
  let chosen = null;
  search: for (const candidate of candidates) {
    for (let shift = ideal; shift >= ideal / 2; shift -= 4) {
      for (const slide of candidate.place === 'on' ? [0] : slides) {
        const option = layout(shift, candidate, slide);
        if (!inside(option.box, width, height, 4)) continue;
        if (candidate.place !== 'on' && mask.boxOccupied(option.box, 0)) continue;
        chosen = option;
        break search;
      }
      // Beside the line, the chip slides rather than moving the line.
      if (candidate.place !== 'on') break;
    }
  }
  chosen ??= layout(ideal, candidates[0], 0);
  const { line, shift } = chosen;
  const extensions = [start, end].map((corner) => [add(corner, scale(push, 4)), add(corner, scale(push, shift + LAYOUT.overshoot))]);
  const tickDirection = [along[0] * Math.SQRT1_2 - along[1] * Math.SQRT1_2, along[0] * Math.SQRT1_2 + along[1] * Math.SQRT1_2];
  const ticks = line.map((point) => [add(point, scale(tickDirection, -LAYOUT.tick)), add(point, scale(tickDirection, LAYOUT.tick))]);
  return { axis, value, line: line.map(round), extensions: extensions.map((e) => e.map(round)), ticks: ticks.map((t) => t.map(round)), chip: { at: round(chosen.at), angle, place: chosen.place }, box: chosen.box, inFrame: inside(chosen.box, width, height, 0) };
}

/** X, Z and height along the box edges nearest the viewer (the ground edges through the lowest ground corner). */
export function dimensions(hero, project, mask = decodeMask(hero.mask, hero.poster.width, hero.poster.height)) {
  const { width, height } = hero.poster;
  const { min, max, size } = hero.bounds;
  const corner = (ix, iy, iz) => [ix ? max[0] : min[0], iy ? max[1] : min[1], iz ? max[2] : min[2]];
  const ground = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([ix, iz]) => ({ ix, iz, point: project(corner(ix, 0, iz)) }));
  const near = ground.reduce((best, candidate) => (candidate.point[1] > best.point[1] ? candidate : best));
  const sign = (bit) => (bit ? 1 : -1);
  const common = { project, width, height, mask };
  const x = dimension({ ...common, axis: 'X', value: metres(size[0]), a: corner(0, 0, near.iz), b: corner(1, 0, near.iz), outward: [0, 0, sign(near.iz)] });
  const z = dimension({ ...common, axis: 'Z', value: metres(size[2]), a: corner(near.ix, 0, 0), b: corner(near.ix, 0, 1), outward: [sign(near.ix), 0, 0] });
  // Height on the outline: the vertical edge at the leftmost or rightmost ground corner, pushed outward horizontally.
  const outline = [ground.reduce((a, b) => (b.point[0] < a.point[0] ? b : a)), ground.reduce((a, b) => (b.point[0] > a.point[0] ? b : a))];
  const candidates = outline.map((g) => {
    const outwardAxes = [[sign(g.ix), 0, 0], [0, 0, sign(g.iz)]];
    const leftward = g.point[0] < width / 2;
    const outward = outwardAxes.reduce((best, axis) => {
      const screen = sub(project(add(corner(g.ix, 0, g.iz), axis)), g.point);
      return (leftward ? -screen[0] : screen[0]) > best.score ? { axis, score: leftward ? -screen[0] : screen[0] } : best;
    }, { axis: outwardAxes[0], score: -Infinity }).axis;
    return dimension({ ...common, axis: 'Y', value: metres(size[1]), a: corner(g.ix, 0, g.iz), b: corner(g.ix, 1, g.iz), outward });
  });
  const y = candidates.find((candidate) => candidate.inFrame) ?? candidates[0];
  return [x, z, y];
}

/**
 * Route one callout: from the anchor at 40 degrees, then level, with the label beyond the level run. The shortest
 * route whose leader leaves the silhouette once and whose label sits in free space inside the frame wins.
 */
function routeCallout({ anchor, label, mask, width, height, avoid, lines }) {
  const [labelLong, labelHigh] = textExtent(label, width, LAYOUT.labelWidthPx);
  const gap = (TEXT.gapPx * width) / LAYOUT.labelWidthPx;
  let best = null;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let run = 64; run <= 720; run += 8) {
      const elbow = add(anchor, [dx * run * Math.cos(LEADER_ANGLE), dy * run * Math.sin(LEADER_ANGLE)]);
      const end = add(elbow, [dx * LAYOUT.level, 0]);
      const box = dx > 0 ? [end[0] + gap, end[1] - labelHigh / 2, end[0] + gap + labelLong, end[1] + labelHigh / 2] : [end[0] - gap - labelLong, end[1] - labelHigh / 2, end[0] - gap, end[1] + labelHigh / 2];
      if (!inside(box, width, height, LAYOUT.margin) || mask.boxOccupied(box, 6)) continue;
      // The leader may start on the part; once it has left the silhouette it must stay outside.
      let left = false;
      let clean = true;
      const steps = Math.ceil(run / 3);
      for (let step = 0; step <= steps + 8; step++) {
        const point = step <= steps ? add(anchor, scale(sub(elbow, anchor), step / steps)) : add(elbow, scale(sub(end, elbow), (step - steps) / 8));
        const occupied = mask.occupied(point[0], point[1]);
        if (!occupied) left = true;
        else if (left) { clean = false; break; }
      }
      if (!clean || !left) continue;
      if (avoid.some((other) => boxesOverlap(other, box, 4) || segmentHitsBox(anchor, elbow, other) || segmentHitsBox(elbow, end, other))) continue;
      const crossings = lines.filter(([p, q]) => segmentsCross(anchor, elbow, p, q) || segmentsCross(elbow, end, p, q)).length;
      const score = run + crossings * 400;
      if (!best || score < best.score) best = { score, elbow, end, side: dx > 0 ? 'right' : 'left', box, crossings };
    }
  }
  return best;
}

/**
 * The axis triad (+X, +Y, +Z as the camera sees them, each a unit screen direction) where the frame is most open:
 * the free position farthest from the silhouette and from every dimension and label, on a 32 x 32 grid.
 */
function triad(hero, project, mask, avoid) {
  const { width, height } = hero.poster;
  const origin3 = hero.camera.target;
  const axes = [['+X', [1, 0, 0]], ['+Y', [0, 1, 0]], ['+Z', [0, 0, 1]]].map(([name, axis]) => ({ name, direction: unit(sub(project(add(origin3, axis)), project(origin3))) }));
  const reach = 0.05 * width;
  const [labelLong, labelHigh] = textExtent('+X', width, LAYOUT.labelWidthPx);
  const gap = (TEXT.gapPx * width) / LAYOUT.labelWidthPx;
  const occupiedCells = [];
  for (let y = 0; y < height; y += height / hero.mask.cells) for (let x = 0; x < width; x += width / hero.mask.cells) if (mask.occupied(x + 1, y + 1)) occupiedCells.push([x + width / hero.mask.cells / 2, y + height / hero.mask.cells / 2]);
  let best = null;
  for (let row = 1; row < 32; row++) {
    for (let column = 1; column < 32; column++) {
      const origin = [(column / 32) * width, (row / 32) * height];
      const labels = axes.map((axis) => {
        const centre = add(origin, scale(axis.direction, reach + gap + labelLong / 2));
        return [centre[0] - labelLong / 2, centre[1] - labelHigh / 2, centre[0] + labelLong / 2, centre[1] + labelHigh / 2];
      });
      const box = [Math.min(origin[0], ...labels.map((b) => b[0])), Math.min(origin[1], ...labels.map((b) => b[1])), Math.max(origin[0], ...labels.map((b) => b[2])), Math.max(origin[1], ...labels.map((b) => b[3]))];
      if (!inside(box, width, height, LAYOUT.margin) || mask.boxOccupied(box, 16) || avoid.some((other) => boxesOverlap(other, box, 16))) continue;
      const distance = (point) => {
        const dx = Math.max(box[0] - point[0], 0, point[0] - box[2]);
        const dy = Math.max(box[1] - point[1], 0, point[1] - box[3]);
        return Math.hypot(dx, dy);
      };
      const clearance = Math.min(160, ...occupiedCells.map(distance), ...avoid.map((other) => distance([(other[0] + other[2]) / 2, (other[1] + other[3]) / 2])));
      if (!best || clearance > best.clearance + 1e-9 || (Math.abs(clearance - best.clearance) <= 1e-9 && origin[1] > best.origin[1])) best = { clearance, origin, box };
    }
  }
  if (!best) return null;
  return { origin: round(best.origin), axes: axes.map((axis) => ({ name: axis.name, tip: round(add(best.origin, scale(axis.direction, reach))), direction: axis.direction.map((value) => Math.round(value * 1000) / 1000) })), box: best.box.map((value) => Math.round(value)) };
}

/** The whole drawing for one hero data file. */
export function heroDrawing(hero) {
  const { width, height } = hero.poster;
  const project = projector(hero.camera, width, height);
  const mask = decodeMask(hero.mask, width, height);
  const dims = dimensions(hero, project, mask);
  const avoid = dims.map((d) => d.box);
  const lines = dims.flatMap((d) => [d.line, ...d.extensions]);
  const callouts = [];
  for (const [index, callout] of hero.callouts.entries()) {
    const anchor = project(callout.centre);
    const name = callout.path.split('/').at(-1);
    const route = routeCallout({ anchor, label: name, mask, width, height, avoid, lines });
    // No free route at the narrowest labelled width: the part keeps its dot and number, and its path goes in the legend.
    if (!route) {
      callouts.push({ index: index + 1, path: callout.path, name, anchor: round(anchor), legendOnly: true });
      continue;
    }
    avoid.push(route.box);
    lines.push([anchor, route.elbow], [route.elbow, route.end]);
    callouts.push({ index: index + 1, path: callout.path, name, anchor: round(anchor), elbow: round(route.elbow), end: round(route.end), side: route.side, crossings: route.crossings, box: route.box.map((v) => Math.round(v)), legendOnly: false });
  }
  const axes = triad(hero, project, mask, avoid);
  return {
    width,
    height,
    dimensions: dims.map(({ box, inFrame, ...rest }) => ({ ...rest, box: box.map((v) => Math.round(v)), inFrame })),
    callouts,
    triad: axes,
  };
}
