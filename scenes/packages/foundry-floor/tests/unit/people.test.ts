// The people interface (src/scene/people.ts): the walk rule that keeps baked-in-place feet planted, and the visit
// kinds a people class draws (sim-config movers `visits`): FF3's humanoid takes the repair and PM visits from the
// technician by data alone, and every visit is still drawn exactly once (tests/unit/glb-world.test.ts runs it).
import { describe, expect, test } from 'bun:test';
import { ServiceWalkers, walkClipS } from '../../src/scene/people';
import type { PersonPose, WalkerSpec } from '../../src/scene/people';
import type { ServiceKind, ServiceVisit } from '../../src/sim/service';
import { FAB_DATA } from '../../src/sim/data';

const spec: WalkerSpec = { speedMps: 1.2, designSpeedMps: 1.2, walkS: 1.1, idleS: 4, serviceS: 3 };
const layout = FAB_DATA.layout.people;
const loop = (_start: number, s: number) => s / 2;

describe('people (the technician and FF3\'s humanoid, by data)', () => {
  test('the walk clip advances one cycle per designSpeed x walkS metres, so the feet stay planted at any speed', () => {
    // At the design speed the clip plays at rate 1: t seconds of walking is t seconds of clip (mod the cycle).
    for (const t of [0, 0.3, 1.1, 2.5, 17.05]) expect(walkClipS(1.2 * t, spec)).toBeCloseTo(t % 1.1, 9);
    // At 0.6 m/s the same distance takes twice as long and the clip covers the same phase: rate speed / 1.2.
    const slow = { ...spec, speedMps: 0.6 };
    expect(walkClipS(0.6 * 1.1, slow)).toBeCloseTo(0.55, 9);
  });

  test('every class draws only its visit kinds; partitioned kinds draw each visit exactly once', () => {
    const visits: ServiceVisit[] = [
      { tool: 'etch-01', kind: 'repair', since: 0, until: 7_200_000 },
      { tool: 'cvd-02', kind: 'pm', since: 0, until: 7_200_000 },
      { tool: 'pvd-01', kind: 'qualification', since: 0, until: 7_200_000 },
    ];
    const ended = () => 0;
    const at = 3_600_000; // an hour in: everyone has arrived
    const drawn = (kinds?: ServiceKind[]) => {
      const w = new ServiceWalkers('x', layout, spec, 12, kinds ? new Set(kinds) : undefined), out: PersonPose[] = [];
      w.update(at, visits, ended);
      return out.slice(0, w.poses(at, out, loop)).map(p => `${p.key}:${p.activity}`).sort();
    };
    expect(drawn()).toEqual(['cvd-02:service', 'etch-01:service', 'pvd-01:idle']);
    const humanoid = drawn(['repair', 'pm']), technician = drawn(['qualification']);
    expect(humanoid).toEqual(['cvd-02:service', 'etch-01:service']);
    expect(technician).toEqual(['pvd-01:idle']);
    expect(drawn([])).toEqual([]);
  });

  test('the configured classes (FF3): the humanoid draws the repair and PM visits, the technician the qualifications', () => {
    const classes = FAB_DATA.config.movers.classes.filter(c => c.kind === 'people');
    const byId = Object.fromEntries(classes.map(c => [c.id, c]));
    expect(byId.humanoid?.visits?.slice().sort()).toEqual(['pm', 'repair']);
    expect(byId.technician?.visits?.slice().sort()).toEqual(['qualification']);
    // A partition: every visit kind is drawn by exactly one class.
    expect(classes.flatMap(c => c.visits ?? []).sort()).toEqual(['pm', 'qualification', 'repair']);
    expect(byId.humanoid?.entity).toBe('humanoidWorkRobot');
    expect(byId.technician?.entity).toBe('technician');
    // The carry clips stay named for the floor moves the twin does not have (FF3 decision 1): nothing plays them.
    expect(byId.humanoid?.clips).toEqual({ walk: 'Walk', idle: 'Idle', service: 'Service', carry: 'Carry', handoff: 'Handoff' });
    expect(byId.humanoid?.carryLocators).toEqual(['foupCarry', 'foupHandoff']);
  });
});
