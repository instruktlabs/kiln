/**
 * The `instructions` field is the only orientation channel that reaches every
 * install shape. A user who configures the server by hand and opens an empty
 * folder has no AGENTS.md, no CLAUDE.md and no registered skills; the skills
 * still ship beside the server, so this text is what tells them so.
 *
 * It is also paid at every session start by every client, so it is bounded
 * (v1 contract rule 5) and points at the skills directory instead of listing
 * what each skill says.
 */
import { describe, expect, it } from 'bun:test';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_SERVER_INSTRUCTIONS } from '../mcp-core';

const repo = fileURLToPath(new URL('../..', import.meta.url));

describe('MCP server instructions', () => {
  it('points at the skills directory that ships beside the server, and the workflow skills exist there', async () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain('skills/');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('SKILL.md');
    for (const name of [
      'kiln-author-asset',
      'kiln-refine-asset',
      'kiln-qa-asset',
      'kiln-compose-scene',
    ]) {
      const skill = join(repo, 'skills', name, 'SKILL.md');
      expect((await stat(skill)).isFile(), name).toBe(true);
    }
  });

  it('carries the contract an ad-hoc client cannot learn anywhere else', () => {
    // Re-sending whole programs instead of reusing a ref is the failure this
    // text exists to prevent, and viewFidelity is what stops a CPU image being
    // read as material evidence.
    expect(MCP_SERVER_INSTRUCTIONS).toContain('programRef');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('viewFidelity');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('kiln_discover');
    // The only channel a hand-wired directory has: no workspace guide exists there.
    expect(MCP_SERVER_INSTRUCTIONS).toContain('render-service/');
  });

  it('names no absolute path, so the same bytes serve every installation', () => {
    expect(MCP_SERVER_INSTRUCTIONS).not.toMatch(/[A-Za-z]:[\\/]|\/(?:home|Users)\//u);
  });

  it('stays an index rather than the skill bodies', () => {
    // The authoring bodies are about 2,700 tokens. Inlining them would be paid
    // at every session start by every client, which is what the Agent Skills
    // progressive-disclosure model exists to avoid. Rule 5 bounds the text at
    // 700 characters; the registry contract test holds that limit.
    expect(MCP_SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(700);
  });
});
