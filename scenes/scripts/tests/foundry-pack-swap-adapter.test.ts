import { expect, test } from 'bun:test';
import * as adapter from '../../packages/foundry-floor/scripts/pack-swap-adapter';

// A swapped child takes its parent's review state: an accepted parent's child is accepted with the owner's approval
// note, any other parent's child stays a review candidate with owner review pending. No state is ever upgraded.
const APPROVED = 'Flush-face fix of an approved revision; approved by the owner on 2026-11-13.';
const R = (n: number) => `r_${String(n).repeat(32).slice(0, 32)}`;
const S = (n: number) => String(n).repeat(64).slice(0, 64);
function swap(id: string, member: string, child: number, parent: number, parentAccepted: boolean): adapter.Swap {
  return {
    id, asset: id, member, revision: R(child), parentRevision: R(parent), sha256: S(child), bytes: new Uint8Array(4),
    manifest: { assetId: id, revisionId: R(child), parentRevision: R(parent), description: 'Flush-face fix: moved the lens apart.', attribution: { model: 'claude-opus-5-5', harness: 'claude' }, files: {} },
    previous: { revision: R(parent), bytes: 4, sha256: S(parent) }, parentAccepted,
  };
}
const accepted = swap('humanoidWorkRobot', 'models/humanoid-work-robot.glb', 2, 1, true);
const candidate = swap('vehicle', 'models/oht-vehicle.glb', 4, 3, false);

test('the review state of a swapped child is its parent state', () => {
  expect(adapter.childStatus(accepted)).toBe('accepted');
  expect(adapter.childStatus(candidate)).toBe('review-candidate');
  expect(adapter.childAuthor(accepted.manifest!, accepted).note.endsWith(APPROVED)).toBe(true);
  expect(adapter.childAuthor(candidate.manifest!, candidate).note.endsWith('Owner review is pending.')).toBe(true);
});

test('parent review states are read from the asset map before the swap', () => {
  const map = { entities: { humanoidWorkRobot: { status: 'accepted' }, vehicle: { status: 'review-candidate' } } };
  const marked = adapter.withParentStates([{ ...accepted, parentAccepted: undefined }, { ...candidate, parentAccepted: undefined }, { ...candidate, id: 'vehicle-sedan', parentAccepted: undefined }], map);
  expect(marked.map(s => s.parentAccepted)).toEqual([true, false, false]);
});

test('the humanoid mover note keeps an accepted parent accepted', () => {
  expect(adapter.swapSimConfigText(`note: accepted and staged (${R(1)}). FF3`, [accepted])).toBe(`note: accepted and staged (${R(2)}). FF3`);
  expect(adapter.swapSimConfigText(`note: accepted and staged (${R(3)}). FF3`, [candidate])).toBe(`note: review candidate, staged (${R(4)}). FF3`);
});

test('replacement records and licence lines carry the inherited state', () => {
  const [entry] = adapter.swapReplacements([], [accepted], {}, 'pack');
  expect(entry!.reason.endsWith(APPROVED)).toBe(true);
  const [pending] = adapter.swapReplacements([], [candidate], {}, 'pack');
  expect(pending!.reason.endsWith('Owner visual review pending.')).toBe(true);
  const licence = ['Release: old', `models/humanoid-work-robot.glb  Kiln asset humanoidWorkRobot, revision ${R(1)}  SHA-256 ${S(1)}`, '    Someone. Requested effort: high.', ''].join('\n');
  expect(adapter.swapLicenceText(licence, [accepted], 'new')).toContain(APPROVED);
});
