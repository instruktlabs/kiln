import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryProgramStore, programReference } from '../program-store';
import { FileProgramStore } from '../program-store-node';
import { createKilnProgramToolRegistry } from '../tools/registry';

const code =
  "const meta = { name: 'Post', category: 'prop' };\nfunction build() { const r = createRoot('Post'); createPart('Body', boxGeo(1, 2, 1), gameMaterial(0x888888), { parent: r, position: [0, 1, 0] }); return r; }\n";

describe('program references', () => {
  it('registers, reads, edits and renders a revision without resending source', async () => {
    const store = new MemoryProgramStore();
    const defs = createKilnProgramToolRegistry({ programStore: store });
    const call = async (name: string, args: unknown) =>
      (await defs.find((d) => d.name === name)!.run(args)) as Record<string, unknown>;
    const initial = await call('kiln_validate', { code });
    const a = initial.programRef as string;
    expect(a).toMatch(/^p_[a-f0-9]{12}$/);
    const source = await call('kiln_source', { programRef: a, query: 'boxGeo', limit: 100 });
    expect(source.code).toContain('boxGeo');
    expect((source.code as string).length).toBeLessThanOrEqual(100);
    const edited = await call('kiln_edit', {
      programRef: a,
      edits: [{ oldString: 'boxGeo(1, 2, 1)', newString: 'boxGeo(1, 3, 1)' }],
    });
    expect(edited.ok).toBe(true);
    expect(edited.parentRef).toBe(a);
    expect(edited.programRef).not.toBe(a);
    expect(edited.code).toBeUndefined();
    expect(edited.pngBase64).toBeString();
    expect(await store.get(a)).toBe(code);
    expect(await store.get(edited.programRef as string)).toContain('boxGeo(1, 3, 1)');
    const rerender = await call('kiln_render', { programRef: edited.programRef });
    expect(rerender.ok).toBe(true);
    expect(rerender.programRef).toBe(edited.programRef);
  });

  it('keeps custom stores without short-reference support compatible', async () => {
    const backing = new MemoryProgramStore();
    const store = { put: backing.put.bind(backing), get: backing.get.bind(backing) };
    const defs = createKilnProgramToolRegistry({ programStore: store });
    const result = (await defs.find((d) => d.name === 'kiln_validate')!.run({ code })) as Record<
      string,
      unknown
    >;
    expect(result.programRef).toBe(await programReference(code));
    const source = (await defs
      .find((d) => d.name === 'kiln_source')!
      .run({ programRef: result.programRef })) as Record<string, unknown>;
    expect(source.code).toBe(code);
  });

  it('preserves inline clients, failed drafts, atomic failures and independent branches', async () => {
    const store = new MemoryProgramStore();
    const defs = createKilnProgramToolRegistry({ programStore: store });
    const edit = defs.find((d) => d.name === 'kiln_edit')!;
    const a = await store.put(code);
    const change = (name: string) => [{ oldString: "name: 'Post'", newString: `name: '${name}'` }];
    const [b, c] = await Promise.all(
      ['B', 'C'].map(
        async (name) =>
          (await edit.run({ programRef: a, edits: change(name), render: false })) as Record<
            string,
            unknown
          >,
      ),
    );
    expect(b!.programRef).not.toBe(c!.programRef);
    const inline = (await edit.run({ code, edits: change('D'), render: false })) as Record<
      string,
      unknown
    >;
    expect(inline.code).toBeUndefined();
    expect(inline.diff).toContain("name: 'D'");
    expect(await store.get(inline.programRef as string)).toContain("name: 'D'");
    const withCode = (await edit.run({
      code,
      edits: change('D'),
      render: false,
      includeCode: true,
    })) as Record<string, unknown>;
    expect(withCode.code).toContain("name: 'D'");
    const failed = (await edit.run({
      programRef: a,
      edits: [...change('E'), { oldString: 'missing', newString: 'x' }],
    })) as Record<string, unknown>;
    expect(failed.ok).toBe(false);
    expect(await store.get(failed.programRef as string)).toBe(code);
    expect(await store.get(a)).toBe(code);
    const invalid = (await defs
      .find((d) => d.name === 'kiln_render')!
      .run({ code: 'bad javascript {' })) as Record<string, unknown>;
    expect(invalid.ok).toBe(false);
    expect(await store.get(invalid.programRef as string)).toBe('bad javascript {');
    await expect(edit.run({ code, programRef: a, edits: change('F') })).rejects.toThrow(
      'exactly one',
    );
    await expect(
      edit.run({ programRef: `sha256:${'0'.repeat(64)}`, edits: change('F') }),
    ).rejects.toThrow('not found');
  });

  it('persists exact source across store instances and detects corrupt content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiln-programs-'));
    try {
      const store = new FileProgramStore(dir);
      const source = `${code}// café\r\n`;
      const ref = await store.put(source);
      expect(await new FileProgramStore(dir).get(ref)).toBe(source);
      expect(await store.put(source)).toBe(ref);
      await writeFile(join(dir, `${ref.slice(7)}.js`), 'corrupted');
      await expect(store.get(ref)).rejects.toThrow('integrity');
      await expect(store.get('../../private')).rejects.toThrow('Invalid program');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('pages source without loss and bounds search results', async () => {
    const store = new MemoryProgramStore();
    const source = `${'α'.repeat(20000)}\nneedle\n${'z'.repeat(20000)}`;
    const ref = await store.put(source);
    const tool = createKilnProgramToolRegistry({ programStore: store }).find(
      (d) => d.name === 'kiln_source',
    )!;
    let offset = 0;
    let joined = '';
    for (;;) {
      const page = (await tool.run({ programRef: ref, offset })) as {
        code: string;
        nextOffset: number | null;
      };
      expect(page.code.length).toBeLessThanOrEqual(8000);
      joined += page.code;
      if (page.nextOffset === null) break;
      offset = page.nextOffset;
    }
    expect(joined).toBe(source);
    const found = (await tool.run({ programRef: ref, query: 'needle', limit: 100 })) as {
      code: string;
    };
    expect(found.code).toContain('needle');
  });
  it('enforces source limits without changing existing revisions', async () => {
    const store = new MemoryProgramStore(4);
    const ref = await store.put('abcd');
    expect(await store.put('abcd')).toBe(ref);
    await expect(store.put('x')).rejects.toThrow('full');
    expect(await store.get(ref)).toBe('abcd');
    await expect(programReference('a'.repeat(1048577))).rejects.toThrow('1 MiB');
    await expect(programReference('\uD800')).rejects.toThrow();
    expect(await programReference('\uFEFFx')).not.toBe(await programReference('x'));
  });
});
