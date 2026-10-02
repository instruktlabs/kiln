import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-project-cli-'));
  const runner = resolve('src/cli.ts');
  return {
    root,
    run: (args: string[], workspace = 'first') =>
      spawnSync(process.execPath, [runner, ...args], {
        cwd: root,
        env: {
          ...process.env,
          KILN_RENDER: 'cpu',
          KILN_WORKSPACE: join(root, workspace),
          KILN_PROGRAM_STORE: join(root, workspace, '.kiln', 'programs'),
        },
        encoding: 'utf8',
        windowsHide: true,
      }),
  };
}

test('project CLI exports and imports an exact configuration bundle into an explicit new project', async () => {
  const { root, run } = await fixture();
  try {
    expect(run(['project', 'create', '--id', 'pilot', '--name', 'Pilot']).status).toBe(0);
    const destination = join(root, 'pilot.zip');
    const exported = run(['project', 'export', 'pilot', '--out', destination]);
    expect(exported.status, exported.stderr).toBe(0);
    const imported = run(
      ['project', 'import', destination, '--id', 'imported', '--collection', 'project'],
      'second',
    );
    expect(imported.status, imported.stderr).toBe(0);
    const project = JSON.parse(imported.stdout).project;
    expect(project.projectId).toBe('imported');
    expect(project.name).toBe('Pilot');
    expect(
      project.references.some((ref: { uri: string }) => ref.uri.startsWith('kiln-import:')),
    ).toBe(true);
    expect(run(['project', 'export', 'pilot', '--out', destination]).status).toBe(1);
    expect(
      run(
        ['project', 'import', destination, '--id', 'imported', '--collection', 'project'],
        'second',
      ).status,
    ).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000); // Five compiled-CLI runs: 2.1 to 3.5 s in the gates of 2 October 2026; past 20 s in the final gate's test step on a host at 97% CPU (3.0 s in that run's coverage step).

test('project CLI shares immutable revisions and rejects stale updates, ignored flags and implicit file selection', async () => {
  const { root, run } = await fixture();
  try {
    const created = run(['project', 'create', '--name', 'Farm', '--id', 'farm']);
    expect(created.status, created.stderr).toBe(0);
    const project = JSON.parse(created.stdout).project;
    expect(project.projectId).toBe('farm');
    expect(JSON.parse(run(['project', 'list']).stdout).projects[0].revisionId).toBe(
      project.revisionId,
    );
    const patch = join(root, 'patch.json');
    await writeFile(
      patch,
      JSON.stringify({
        design: { style: 'Low poly', palette: [{ role: 'grass', color: '#567A36' }] },
      }),
    );
    const updated = run([
      'project',
      'update',
      'farm',
      '--expected',
      project.revisionId,
      '--file',
      patch,
    ]);
    expect(updated.status, updated.stderr).toBe(0);
    const revision = JSON.parse(updated.stdout).project;
    expect(revision.parentRevision).toBe(project.revisionId);
    expect(revision.design.palette[0].role).toBe('grass');
    expect(
      run(['project', 'update', 'farm', '--expected', project.revisionId, '--file', patch]).status,
    ).toBe(1);
    expect(
      JSON.parse(run(['project', 'get', 'farm', '--revision', project.revisionId]).stdout).project
        .design.style,
    ).toBe('');
    expect(JSON.parse(run(['project', 'get', 'farm']).stdout).project.revisionId).toBe(
      revision.revisionId,
    );
    expect(run(['project', 'list', '--file', patch]).status).toBe(1);
    expect(run(['project', 'create', '--name', '--id', 'bad']).status).toBe(1);
    expect(run(['project', 'update', 'farm', '--file', patch]).status).toBe(1);
    expect(run(['project', 'get', 'farm', 'ignored']).status).toBe(1);
    expect(run(['project', 'create', '--file', patch, '--name', 'Ambiguous']).status).toBe(1);
    expect(run(['project', '--help']).stdout).toContain('expected');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000); // Twelve compiled-CLI runs: 4.8 to 7.8 s in the gates of 2 October 2026; past 20 s on the same loaded host (7.6 s in that run's coverage step).

test('material CLI creates deterministic recipes and exports/imports exact portable records with no implicit paths', async () => {
  const { root, run } = await fixture();
  try {
    const file = join(root, 'material.json');
    await writeFile(
      file,
      JSON.stringify({
        materialId: 'plaster',
        name: 'Plaster',
        tileable: true,
        sources: [
          {
            id: 'authored',
            kind: 'procedural',
            provider: 'Kiln',
            creator: 'Fixture',
            license: {
              spdx: 'CC0-1.0',
              url: 'https://creativecommons.org/publicdomain/zero/1.0/',
              attribution: '',
            },
            originalFiles: [],
          },
        ],
        maps: [
          {
            slot: 'baseColor',
            sourceId: 'authored',
            transforms: [],
            procedural: {
              schemaVersion: 2,
              usage: 'albedo',
              size: 8,
              layers: [
                { op: 'noise', colorA: 0xaaaabb, colorB: 0xbbbbcc, seed: 17, scale: 4, octaves: 2 },
              ],
            },
          },
        ],
      }),
    );
    const generated = run(['material', 'procedural', '--file', file]);
    expect(generated.status, generated.stderr).toBe(0);
    const material = JSON.parse(generated.stdout).materials[0];
    const listed = JSON.parse(run(['material', 'list']).stdout);
    expect(listed.materials[0].revisionId).toBe(material.revisionId);
    // The CLI lists the summaries kiln_material list returns, not every manifest (a workspace
    // with five pinned materials printed 34,116 characters, 2 October 2026).
    expect(listed.materials[0].slots).toEqual(['baseColor']);
    expect(listed.materials[0]).not.toHaveProperty('maps');
    const exact = run(['material', 'get', 'plaster', material.revisionId]);
    expect(exact.status, exact.stderr).toBe(0);
    expect(JSON.parse(exact.stdout).manifest).toEqual(material);
    expect(JSON.parse(exact.stdout).portableSpec.textures.baseColor.resourceId).toContain(
      material.revisionId.slice(7),
    );
    const payload = join(root, 'portable.json');
    const exported = run(['material', 'export', 'plaster', material.revisionId, '--out', payload]);
    expect(exported.status, exported.stderr).toBe(0);
    const bytes = await readFile(payload);
    expect(
      run(['material', 'export', 'plaster', material.revisionId, '--out', payload]).status,
    ).toBe(1);
    expect(await readFile(payload)).toEqual(bytes);
    const imported = run(['material', 'import', '--file', payload], 'second');
    expect(imported.status, imported.stderr).toBe(0);
    expect(JSON.parse(imported.stdout).materials[0]).toEqual(material);
    expect(run(['material', 'import', payload], 'second').status).toBe(1);
    expect(run(['material', 'get', 'plaster', '../outside']).status).toBe(1);
    expect(run(['material', 'procedural', '--file', payload]).status).toBe(1);
    const presets = run(['material', 'presets']);
    expect(presets.status, presets.stderr).toBe(0);
    expect(JSON.parse(presets.stdout).presets.map((item: { id: string }) => item.id)).toContain(
      'wood-grain',
    );
    const presetFile = join(root, 'preset.json');
    await writeFile(
      presetFile,
      JSON.stringify({
        presetId: 'wood-grain',
        seed: 19,
        size: 64,
        creator: 'CLI fixture',
        license: {
          spdx: 'CC0-1.0',
          url: 'https://creativecommons.org/publicdomain/zero/1.0/',
          attribution: '',
        },
      }),
    );
    const preset = run(['material', 'create-preset', '--file', presetFile]);
    expect(preset.status, preset.stderr).toBe(0);
    expect(JSON.parse(preset.stdout).material.maps).toHaveLength(3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000); // Eleven compiled-CLI runs: 4.6 to 7.1 s in the gates of 2 October 2026; past 20 s on the same loaded host (6.1 s in that run's coverage step).
