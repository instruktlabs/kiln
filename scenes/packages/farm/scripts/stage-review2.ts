// Local review child pack. Preserves the sealed r34 pack and every unchanged runtime member.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stageFiles, verifyStaged } from '@kiln-scenes/scene-kit/staging';
import type { PackManifest } from '@kiln-scenes/scene-kit';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), before = resolve(root, 'packages/farm/staged/r34');
const out = resolve(root, 'packages/farm/staged/r35-local-review');
const parent = JSON.parse(readFileSync(resolve(before, 'pack.json'), 'utf8')) as PackManifest;
const verified = verifyStaged(before); if (!verified.ok) throw new Error(verified.problems.join('\n'));
const revision = 'r_654c203b0ed3438c93d19b6709bef9f6', asset = 'a_2ff8e7e260894a879fb49e63a8521915';
const hand = resolve(root, '../engine-work/local-v09-review/revision2-20260930/farm-site-intake/farmer-runtime.glb');
const handHash = '088edfec80dc0ed8da9a3883ebf74ff75d55efdb71a056ddb271b553999c3c9e';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const files = parent.files.map(file => ({ from: file.path === 'models/farmer.glb' ? hand : resolve(before, file.path), to: file.path, sha256: file.path === 'models/farmer.glb' ? handHash : file.sha256 }));
const result = stageFiles({ id: parent.id, release: 'r35-local-review', three: '0.186.1', out, force: true,
  models: parent.models.map(model => ({ id: model.id, to: model.path })), data: parent.data, files, credits: parent.credits,
  source: { parentRelease: 'r34', parentPackSha256: hash(readFileSync(resolve(before, 'pack.json'))), ownerAccepted: false,
    replacements: [{ id: 'farmer', assetId: asset, parentRevision: 'r_d0e65e4d47aa4449a07ed288a78d461b', revision, sha256: handHash, exportProfile: 'runtime', canonicalSha256: '6ebf243099f0325e30c3937c41d079e95e3d98a20a92e0d6436234c926139bfd',
      scope: 'Hand geometry refinement; original joint frames, sockets and native clip channels retained. Walking arm pose belongs to scene source.' }] } });
const after = verifyStaged(out); if (!after.ok) throw new Error(after.problems.join('\n'));
const report = { ...result, out, verification: after, parentPackSha256: hash(readFileSync(resolve(before, 'pack.json'))), packSha256: hash(readFileSync(resolve(out, 'pack.json'))), handHash, revision, asset, ownerAccepted: false };
const evidence = resolve(root, '../engine-work/local-v09-review/revision2-golden-farm'); mkdirSync(evidence, { recursive: true });
writeFileSync(resolve(evidence, 'farm-intake.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
