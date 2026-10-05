import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { zipSync } from 'fflate';
import { hashBytes } from './mirror-core.mjs';
import { stageTroy } from './stage-troy.mjs';
import { buildInfo } from './build-info.mjs';

test('build identity records the sealed Troy module scene and rejects changed runtime code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'troy-identity-'));
  try {
    const folder=join(root,'dist/scene-packs/troy/troy-01');
    await mkdir(join(folder,'web'),{recursive:true});
    const body=Buffer.from('<html>Troy</html>'),file={path:'web/index.html',bytes:body.length,sha256:hashBytes(body)};
    await writeFile(join(folder,file.path),body);
    await writeFile(join(folder,'THIRD-PARTY-NOTICES.txt'),'Three.js MIT');
    await writeFile(join(folder,'pack.json'),JSON.stringify({schema:'kiln.scene-pack/1',id:'troy',release:'troy-01',three:'0.186.1',files:[file]}));
    await writeFile(join(folder,'SHA256SUMS'),file.sha256+'  '+file.path+'\n');
    const info=await buildInfo({site:root,dist:join(root,'dist'),commitOf:()=>({commit:'abcdef0',top:'/fixture',clean:true})});
    expect(info.scenes.troy.runtime.file).toBe('web/index.html');
    expect(info.scenes.troy.runtime.sha256).toBe(file.sha256);
    await writeFile(join(folder,file.path),'changed');
    await expect(buildInfo({site:root,dist:join(root,'dist'),commitOf:()=>({commit:'abcdef0',top:'/fixture',clean:true})})).rejects.toThrow('verification failed');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('Troy stages only sealed public files and rejects a changed archive before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'troy-public-'));
  try {
    const body = Buffer.from('<html>Troy</html>');
    const delivery = { release: 'troy-01', files: { 'web/index.html': { bytes: body.length, sha256: hashBytes(body) } } };
    const archive = zipSync({ 'web/index.html': body, 'delivery.json': Buffer.from(JSON.stringify(delivery)) });
    const record = { release: 'troy-01', path: 'packs/troy/troy-01.zip', bytes: archive.length, sha256: hashBytes(archive) };
    const mirror = join(root, 'mirror');
    await mkdir(join(mirror, 'packs/troy'), { recursive: true });
    await writeFile(join(mirror, record.path), archive);
    await stageTroy({ site: join(root, 'site'), record, mirror });
    expect(await readFile(join(root, 'site/public/scene-packs/troy/troy-01/web/index.html'), 'utf8')).toBe(body.toString());
    await expect(stageTroy({ site: join(root, 'bad-site'), record: { ...record, sha256: '0'.repeat(64) }, mirror })).rejects.toThrow('verification failed');
    const changed = zipSync({ 'web/index.html': Buffer.from('changed'), 'delivery.json': Buffer.from(JSON.stringify(delivery)) });
    await writeFile(join(mirror, record.path), changed);
    await expect(stageTroy({ site: join(root, 'changed-site'), record: { ...record, bytes: changed.length, sha256: hashBytes(changed) }, mirror })).rejects.toThrow('verification failed');
  } finally { await rm(root, { recursive: true, force: true }); }
});
