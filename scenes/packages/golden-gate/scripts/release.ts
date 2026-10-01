// SPDX-License-Identifier: MIT
// The staged release that the builds, checks and tests use, and the bridge runtimes it pins. Kept in
// one module with no imports beyond node:path so every tool reads the same pins cheaply:
// scripts/stage.ts verifies and stages them, scripts/layout.ts derives the lanes from the pinned
// roadway, tests/tools/build.ts and make-hub-kit.ts carry the release, and the unit tests read it.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * g1: the review-2 bridge runtimes (builder, 2026-09-29). g2: the accepted bridge fix-up 1 (fix round 1,
 * golden-gate-scene/SCENE-REVIEW-1.md item 1); vehicles, terrain and data staged as in g1. g3: the bridge
 * author's reviews 1 (fender ring and truss sections) and 2 (roadway profile) of fix round 2, accepted by
 * the coordinator (showcase/authors/sonnet-gg-bridge-fix/COORDINATOR-REVIEW-3.md, 22:45), then review 3
 * (the expansion joints redrawn as flush 0.6 m steel plates, node Deck_Mesh_ExpansionJoints and a tenth
 * material, JointSteel; full and web only, the far runtime unchanged), swapped in at 23:20 (the
 * review-2 pins are kept below); vehicles and terrain as in g2, data with the approach roads
 * (golden-gate-scene/SCENE-REVIEW-2.md). g4 (coordinator, 2026-09-30 05:25): the same bridge pins, vehicles and
 * terrain as g3; the data copies refreshed with fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md: the joint-plate
 * offset, the dressing and the Marin cut in layout.json, the vegetation tiers in tiers.json), which g3 predated.
 * g5 (coordinator, 2026-09-30, after bridge-fix review 5): the anchorage housing and shaft lift lines cut as real
 * reveals (showcase/authors/sonnet-gg-bridge-fix/REPORT.md, "Review 5: lift construction fix") instead of slabs
 * layered over the retained faces (review 4, rejected for depth fighting); web and full tiers only, the far
 * runtime, vehicles, terrain and data as in g4 (the g4 pins are kept below).
 */
// g6 (coordinator, 2026-09-30, after the site's adversarial design review): identical to g5 except the terrain
// record `terrain/frame.json`, whose `bridge_glb.path` is now the bare file name instead of a local absolute path
// (fixed in the terrain pipeline's frame writer and its manifest); the bridge tiers, vehicles, tiles and data are
// g5's, so the pins below are unchanged.
// g7 (coordinator, 2026-09-30, after the site's content review): g6 plus the six generated vehicle licence texts
// rewritten to the Farm pack's designation with the owner's scope qualifier (D-35) and without working names
// (`vehicleLicenceText` in stage.ts); every model file and pin unchanged.
// g8: local review2, revised controls/arrival data and three source-backed car children; g7 remains sealed.
// g9: final r4 six-vehicle saved children/runtime derivatives; controller, terrain and camera inputs unchanged.
export const STAGED_RELEASE = 'g9';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMONS = resolve(PACKAGE_ROOT, '../../..');
export const stagedDir = (release: string = STAGED_RELEASE): string => resolve(PACKAGE_ROOT, 'staged', release);

/**
 * The accepted bridge runtimes (showcase/authors/sonnet-gg-bridge-fix), one Kiln asset. The outputs folder
 * carries no delivery audit, so staging checks every file against these pinned bytes and SHA-256
 * (COORDINATOR-REVIEW-3.md table for g3). The web and far runtimes are staged, as in g1; the full tier is
 * verified and recorded, not served.
 *
 * g3 revisions are two generations newer than the revisions the licence's "Fix-up 1" section names (g2's:
 * web r_28ac511a..., far r_7fd11f06..., full r_cba97c6c...). `licensed` names that revision and its
 * parent; staging walks the author's Kiln asset library (BRIDGE_LIBRARY, one manifest.json per revision
 * with its parentRevision) from the pinned revision through `parent` to it, so every staged runtime
 * descends from a licensed revision of the same CC0 asset.
 */
export const BRIDGE_SOURCE = resolve(COMMONS, 'showcase/authors/sonnet-gg-bridge-fix/outputs');
export const BRIDGE_ASSET = 'a_9fafaa6e7f4c4868a372e8f3b0b84738';
/** The author's Kiln asset library: revisions/<revision>/manifest.json. */
export const BRIDGE_LIBRARY = resolve(COMMONS, 'showcase/authors/sonnet-gg-bridge-fix/assets/kiln', BRIDGE_ASSET, 'revisions');
export interface BridgePin {
  file: string; metadata: string; revision: string; parent: string; bytes: number; sha256: string; triangles: number;
  /** The revision the licence names, with its parent, when the pinned revision descends from it. */
  licensed?: { revision: string; parent: string };
}
export const BRIDGE_PINS = {
  web: { file: 'golden-gate-web.glb', metadata: 'golden-gate-web.kiln-metadata.json', revision: 'r_de88c9d5481d4642837b9d00c81cf0a9', parent: 'r_2632afa018de4ac28bde9ffc7ed19e47', bytes: 3_508_476, sha256: '6effde24b2b9dfac04451244ee533bb755ba7d4c192a280caaec70ca31656a03', triangles: 85_822, licensed: { revision: 'r_28ac511af71d4db69a2d7cff8b243a24', parent: 'r_ba838a2a86e04f2493b5d55b493a766a' } },
  far: { file: 'golden-gate-far.glb', metadata: 'golden-gate-far.kiln-metadata.json', revision: 'r_fcddc546fa134910b2221561353d97e2', parent: 'r_d3f2f39ee4964708a0301d7e7082d12b', bytes: 490_460, sha256: '5881f49df60bf3c05e8043de73b3b0ba68335896983097950ab2af6ff28c98a4', triangles: 11_480, licensed: { revision: 'r_7fd11f06f23b4bfc93b9b47ab1b6ca04', parent: 'r_0da2d1ae635c4f84a10e58e0e03936e7' } },
} as const satisfies Record<string, BridgePin>;
export const BRIDGE_FULL: BridgePin = { file: 'golden-gate.glb', metadata: 'golden-gate.kiln-metadata.json', revision: 'r_76c7a4080e7844e185896b7e1b196e5a', parent: 'r_8e986268599c44ff93d451e81520aaec', bytes: 12_402_960, sha256: '31306263a1c5f7410eab1ff65253765fb4084d9f0ec0d4c1b27e66f12a9f7f28', triangles: 311_826, licensed: { revision: 'r_cba97c6c2fc448ee9ca24741d772fa39', parent: 'r_8b79b09984b14e15b9426f6db2df0140' } };
/** g4's bridge pins (the review-3 exports, g3's after the joint swap), kept for the record (far unchanged in g5). */
export const BRIDGE_PINS_G4 = {
  web: { revision: 'r_e5da8e08bd424a8796a033fbb9793104', parent: 'r_8285ccc5ffab4519b049936f792c15ee', bytes: 3_336_720, sha256: '407f727a19898ba09e2143a729e4d353bcf92d90f2eae99f0407327ac37f151f', triangles: 83_092 },
  full: { revision: 'r_0d1532b4a00b4663909f8edf2bd290aa', parent: 'r_03e7981b4ff84159aa4533c587f033c7', bytes: 12_244_400, sha256: '9dbff3c7bda8bfddd39b12899f2857ca8afb02f74f6edc087e5ef8156195c1b1', triangles: 309_576 },
} as const;
/** g3 as first staged (review 2, 23:00), before the review-3 expansion-joint swap; kept for the record (far unchanged). */
export const BRIDGE_PINS_G3_REVIEW2 = {
  web: { revision: 'r_8285ccc5ffab4519b049936f792c15ee', bytes: 3_336_548, sha256: '9a4ecfb501bcf28344212a279c99a19cd79d33fd3cc839494311a71153a04521', triangles: 83_092 },
  full: { revision: 'r_03e7981b4ff84159aa4533c587f033c7', bytes: 12_244_232, sha256: 'f3465450531ebf5eed7765ad445e86ff19fa3a040191feda2d2386d555944589', triangles: 309_576 },
} as const;
/** g2's pins (fix round 1), kept for the record. */
export const BRIDGE_PINS_G2 = {
  web: { revision: 'r_28ac511af71d4db69a2d7cff8b243a24', bytes: 3_039_336, sha256: 'ca6d3e2ee9a5f190fb6eac12720bb79b4b477caece75258147f4a008f32906a1', triangles: 76_452 },
  far: { revision: 'r_7fd11f06f23b4bfc93b9b47ab1b6ca04', bytes: 544_676, sha256: '48bfaacae2b8150f0da0d9e97272a9f56129d1cd913a8224f8429b0bc2e1a0ba', triangles: 13_088 },
  full: { revision: 'r_cba97c6c2fc448ee9ca24741d772fa39', bytes: 11_807_960, sha256: 'e08274b16197dc86dce71b8b5f3bde588f383964ec4de853d4aef93064ec34bc', triangles: 300_568 },
} as const;
/** One licence covers the three tiers; its "Fix-up 1" section names each licensed revision and its parent. */
export const BRIDGE_LICENCE = { file: 'ASSET-LICENSE.txt', bytes: 2_458, sha256: '90fdb5eb334ce031ee8eb81d34dfbd701110b869707e63f7844e83fe10d10206', section: 'Fix-up 1', staged: 'licenses/bridge/golden-gate.ASSET-LICENSE.txt' } as const;

/** The pinned web runtime at its source: the roadway the lane polylines follow (scripts/layout.ts). */
export const BRIDGE_WEB_GLB = resolve(BRIDGE_SOURCE, BRIDGE_PINS.web.file);
/** A pinned runtime inside a staged release. */
export const stagedBridge = (tier: keyof typeof BRIDGE_PINS, release: string = STAGED_RELEASE): string => resolve(stagedDir(release), 'bridge', BRIDGE_PINS[tier].file);
