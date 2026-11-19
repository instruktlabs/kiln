/**
 * `kiln mcp`: start the stdio MCP server from the package's default executable.
 *
 * `npx @instruktlabs/kiln` runs the `kiln` executable, because the unscoped package
 * name selects it among the package's three. The official MCP registry builds its
 * launch command from the package name, so the server needs a subcommand there. This
 * only starts `mcp-server.mjs` beside the CLI; the thin entry and its lazy engine
 * load stay in that file, and the CLI never imports the server or the engine here.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function serverPath(): string {
  const bundled = import.meta.url.endsWith('.mjs');
  return fileURLToPath(
    new URL(bundled ? './mcp-server.mjs' : '../dist/mcp-server.mjs', import.meta.url),
  );
}

export async function mcpMain(args: readonly string[]): Promise<number> {
  if (args.length > 0) {
    console.error('kiln mcp takes no arguments; configure the server with KILN_* variables.');
    return 2;
  }
  const entry = serverPath();
  if (!existsSync(entry)) {
    console.error(
      'The MCP server entry is missing beside the CLI. Reinstall Kiln, or run bun run build:runtime in a source checkout.',
    );
    return 1;
  }
  return await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [entry], { stdio: 'inherit', windowsHide: true });
    child.once('error', (error) => {
      console.error(`Could not start the MCP server: ${error.message}`);
      resolve(1);
    });
    child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
