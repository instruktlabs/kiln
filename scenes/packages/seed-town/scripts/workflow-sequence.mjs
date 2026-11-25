import { buildingBoxes } from '../src/layout.ts';

export const shots = [
  {id: 'bay', start: 0}, {id: 'variants', start: 2.2}, {id: 'building', start: 5.2},
  {id: 'street', start: 10.5}, {id: 'town', start: 15.8}, {id: 'trees', start: 22.8},
];
export const duration = 28;
export const leadBay = 'aW1-floor1-0';
export function ease(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

// A main row has lot IDs. Side facades, back walls and street furniture have
// independent planner IDs, so associate them with the actual lot they touch.
export function assemblySchedule(plan, trees) {
  const boxes = buildingBoxes(plan);
  const lots = plan.sides.flatMap(side => side.buildings.flatMap((b, i) =>
    b.type === 'flank' ? [] : [side.name + i]));
  const startByLot = new Map();
  const rest = lots.filter(id => !/^aW\d+$/.test(id));
  const distance = id => {
    const box = boxes[lots.indexOf(id)];
    return Math.hypot((box.minX + box.maxX) / 2 + 6, .72 * ((box.minZ + box.maxZ) / 2 - 8));
  };
  rest.sort((a,b) => distance(a) - distance(b));
  rest.forEach((id, i) => startByLot.set(id, 15.8 + 4.75 * i / (rest.length - 1)));
  ['aW0', 'aW2', 'aW3', 'aW4', 'aW5', 'aW6', 'aW7', 'aW8', 'aW9']
    .forEach((id, i) => startByLot.set(id, 10.5 + .51 * i));
  startByLot.set('aW1', 6.25);

  function owner(p) {
    const prefix = p.id.split('-')[0];
    if (startByLot.has(prefix)) return prefix;
    const angle = p.yaw * Math.PI / 180, halfBay = (p.values.bayWidth ?? 0) / 2;
    const x = p.pos[0] + Math.sin(angle) * halfBay - .12 * Math.cos(angle);
    const z = p.pos[2] + Math.cos(angle) * halfBay + .12 * Math.sin(angle);
    let best = Infinity, lot;
    boxes.forEach((b, i) => {
      const d = Math.hypot(Math.max(b.minX - x, x - b.maxX, 0), Math.max(b.minZ - z, z - b.maxZ, 0));
      if (d < best) { best = d; lot = lots[i]; }
    });
    return lot;
  }

  const entries = plan.placements.map(place => {
    if (place.id === leadBay) return {place, start: 0, end: 0};
    const lot = owner(place), hero = lot === 'aW1';
    const column = Number(place.id.match(/-(?:ground|floor\d+|paving)-(\d+)$/)?.[1] ?? 0);
    const floor = Number(place.id.match(/-floor(\d+)-/)?.[1] ?? 0);
    const course = place.kit === 'paving' || place.kit === 'junction' ? 0 :
      place.kit === 'ground-bay' ? .20 : floor ? .46 + .20 * (floor - 1) :
      place.kit === 'roof' ? 1.20 : 1.38;
    const start = startByLot.get(lot) + course * (hero ? 2.05 : 1) + .045 * column;
    return {place, start, end: start + (hero ? .74 : .55)};
  });
  const cx = (plan.town.x0 + plan.town.x1) / 2, cz = plan.town.length / 2;
  // Sweep round the town in bearing order so each group arrives together.
  const bearing = p => (Math.atan2(p.pos[0] - cx, p.pos[2] - cz) + Math.PI * 2) % (Math.PI * 2);
  const orderedTrees = [...trees].sort((a, b) => bearing(a) - bearing(b));
  orderedTrees.forEach((place, i) => {
    const start = 22.8 + 3.45 * i / Math.max(1, trees.length - 1);
    entries.push({place, start, end: start + .78});
  });
  return entries.sort((a, b) => a.start - b.start);
}
