/**
 * The `instructions` field is the only orientation channel that reaches every
 * install shape. A user who configures the server by hand and opens an empty
 * folder has no AGENTS.md, no CLAUDE.md and no registered skills; the skills
 * still ship beside the server, so this text is what tells them so.
 *
 * It names its skills as literal strings, which is what makes it worth testing:
 * a renamed or removed skill directory would leave the server advertising a
 * path that does not exist, and nothing else would notice.
 */
import { describe, expect, it } from 'bun:test';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_SERVER_INSTRUCTIONS } from '../mcp-core';

const repo = fileURLToPath(new URL('../..', import.meta.url));

describe('MCP server instructions', () => {
  it('names only skills that exist on disk', async () => {
    const named = [
      ...new Set(
        [...MCP_SERVER_INSTRUCTIONS.matchAll(/^\s*-\s+(kiln-[a-z-]+):/gm)].map(
          (match) => match[1]!,
        ),
      ),
    ];
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) {
      const skill = join(repo, 'skills', name, 'SKILL.md');
      expect((await stat(skill)).isFile()).toBe(true);
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

  it('offers registration without instructing an unrequested write', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain('.claude/skills/');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('.agents/skills/');
    // Two constraints on the wording: the copy is proposed, never performed
    // unasked, and it does not take effect until the next session.
    expect(MCP_SERVER_INSTRUCTIONS).toContain('Ask before writing');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('new session');
  });

  it('stays an index rather than the skill bodies', () => {
    // The five authoring bodies are about 2,700 tokens. Inlining them would be
    // paid at every session start by every client, which is what the Agent
    // Skills progressive-disclosure model exists to avoid.
    const approxTokens = MCP_SERVER_INSTRUCTIONS.split(/\s+/u).length * 1.3;
    expect(approxTokens).toBeLessThan(700);
  });
});
