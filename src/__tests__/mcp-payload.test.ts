/**
 * Discovery must stay bounded across structured and human-readable transports.
 * A compact overview contains summaries and a short starting guide; exact detail
 * supplies contracts separately. These checks exercise the real MCP serialization.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { kilnMcpToolDefs, runTool } from '../mcp-engine';

const REPO = resolve(import.meta.dir, '..', '..');

/** Comfortably above the measured 36,647 and far below the 90,497 that broke. */
const CATALOG_CEILING = 48 * 1024;

const defOf = (name: string) => {
  const def = kilnMcpToolDefs().find((d) => d.name === name);
  if (!def) throw new Error(`no such tool: ${name}`);
  return def;
};

describe('kiln_discover wire payload', () => {
  it('sends the catalog once, not twice', async () => {
    const def = defOf('kiln_discover');
    const raw = (await def.run({})) as { entries: unknown[]; total: number; text: string };
    const wire = await runTool(def, {});

    // The structured array is still there for in-process callers.
    expect(raw.entries).toHaveLength(6);
    expect(raw.total).toBeGreaterThan(50);

    const block = wire.content[0] as { type: string; text: string };
    expect(block.type).toBe('text');
    // What goes out is the rendered text verbatim...
    expect(block.text).toBe(raw.text);
    // ...and not a JSON dump that would repeat every entry a second time.
    expect(block.text.startsWith('{')).toBe(false);
    expect(block.text).not.toContain('"signature":');
  });

  it('stays under the size that derails a harness', async () => {
    const wire = await runTool(defOf('kiln_discover'), {});
    const bytes = Buffer.byteLength(JSON.stringify(wire), 'utf8');
    expect({ tool: 'kiln_discover', over: bytes > CATALOG_CEILING }).toEqual({
      tool: 'kiln_discover',
      over: false,
    });
  });

  /**
   * The catalog is the big one, but the rule is general: no text-only tool
   * result should be shipping tens of kilobytes. Image-bearing tools are
   * exempt -- their bytes are the point, and they are base64 by necessity.
   */
  it('no text-only tool result is oversized', async () => {
    const oversized: string[] = [];
    for (const def of kilnMcpToolDefs()) {
      if (def.media || def.mediaMulti) continue;
      let wire: Awaited<ReturnType<typeof runTool>>;
      try {
        wire = await runTool(def, {});
      } catch {
        continue; // needs real arguments; covered by its own tests
      }
      if (Buffer.byteLength(JSON.stringify(wire), 'utf8') > CATALOG_CEILING)
        oversized.push(def.name);
    }
    expect(oversized).toEqual([]);
  });
});

/**
 * The always-on cost of attaching Kiln.
 *
 * Everything else a harness pays for Kiln is per-call and visible. This is the
 * part that is paid on every turn of every session whether or not the model is
 * modelling anything: the tool schemas the harness advertises, and the front
 * matter each skill uses to say when it applies. Measure the actual advertised
 * definitions so changes cannot silently expand this fixed context cost.
 *
 * The ceilings are the point of the test. Record measured increases and their
 * rationale in the change review. If a description grows for a good reason, the
 * failure is a prompt to re-measure, not a rule against writing documentation.
 */
describe('always-on context cost', () => {
  const schemaChars = () => {
    let total = 0;
    for (const def of kilnMcpToolDefs()) {
      // The MCP SDK derives the advertised JSON Schema from the same zod
      // object, so converting it here measures what a harness is actually
      // sent rather than a stand-in for it.
      const schema = z.toJSONSchema(def.inputSchema as never, { io: 'input' });
      total += JSON.stringify({
        name: def.name,
        description: def.description,
        inputSchema: schema,
      }).length;
    }
    return total;
  };

  const frontMatterChars = async () => {
    const dir = join(REPO, 'skills');
    let total = 0;
    let count = 0;
    for (const name of await readdir(dir)) {
      // Normalize before measuring. The count is a claim about how much a
      // skill says about itself, and that must not change with whoever checked
      // the tree out: a CRLF working copy counts one extra character per line
      // and disagrees with CI, which is exactly how this assertion first
      // failed. `.gitattributes` keeps the tree LF; this keeps the measurement
      // honest even where it is not.
      const md = (await readFile(join(dir, name, 'SKILL.md'), 'utf8')).replace(/\r\n/g, '\n');
      const fm = /^---\n([\s\S]*?)\n---/.exec(md);
      if (!fm) throw new Error(`skills/${name}/SKILL.md has no front matter`);
      total += fm[1]!.length;
      count++;
    }
    return { total, count };
  };

  it('the tool schemas stay within the context budget', async () => {
    const chars = schemaChars();
    // 32,455 serialized characters for fourteen tools, including bounded part
    // listing on inspect. This replaces guessed paths/repeated image calls for
    // scenes over the 80-part preview. No new tool or loaded helper catalog.
    // Keep the new bound explicit; this is context cost, not a coverage gate.
    expect(chars).toBeLessThan(32 * 1024);
  });

  it('skill discovery stays within the context budget', async () => {
    const { total, count } = await frontMatterChars();
    // Six since kiln-setup-workspace was added: the authoring five plus the
    // repo-side setup skill, which is the one an agent in a bare clone needs
    // before any of the others apply. A hard count keeps adding a skill a
    // deliberate act, because every one of these is paid at session start.
    expect(count).toBe(6);
    // Front matter is a name and one sentence. Anything much past this is a
    // skill trying to teach from the index instead of from its body.
    expect(total).toBeLessThan(2048);
  });
});
