/**
 * Reads a host requirements binding file without the schema layer.
 *
 * The MCP entry reads the file at startup, so a wrong path, bad JSON or a
 * retired policy key is a startup exit the way a wrong command line is, while
 * the schema validation (zod, part of the engine) waits for the first call.
 * The CLI reads through `readHostRequirementsFile` in `requirements-file.ts`,
 * which adds that validation on top of this module. Nothing here may import
 * zod or the engine: `dist/mcp-server.mjs` bundles it.
 */
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';

export const CATEGORY_MIGRATION_MESSAGE =
  '--category was removed. Use descriptive labels in Discovery recipes; explicit execution requirements use --requirements <host-binding.json>. See docs/migration.md.';

/** Thrown when a host still supplies the retired `category` or `intent` policy keys. */
export class RequirementsMigrationRequiredError extends Error {
  readonly code = 'REQUIREMENTS_MIGRATION_REQUIRED';
  constructor() {
    super(
      'Legacy category/AssetIntent execution requires explicit migration to a host-bound AssetRequirementsV1 record. Use descriptive labels for discovery; do not silently select a prop policy.',
    );
    this.name = 'RequirementsMigrationRequiredError';
  }
}

export function assertNoLegacyRuntimePolicy(options: {
  intent?: unknown;
  category?: unknown;
}): void {
  if (options.intent !== undefined || options.category !== undefined)
    throw new RequirementsMigrationRequiredError();
}

/** The file's JSON, bounded and checked for retired policy keys, not yet validated. */
export async function readHostRequirementsJson(path: string): Promise<unknown> {
  const limit = 1024 * 1024;
  const file = await open(resolve(path), 'r');
  let input: unknown;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error('--requirements requires a regular JSON file no larger than 1 MiB.');
    const buffer = Buffer.alloc(limit + 1);
    let total = 0;
    while (total < buffer.length) {
      const read = await file.read(buffer, total, buffer.length - total, null);
      if (read.bytesRead === 0) break;
      total += read.bytesRead;
    }
    if (total > limit) throw new Error('--requirements JSON exceeds 1 MiB.');
    try {
      input = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total)),
      );
    } catch {
      throw new Error('--requirements must contain valid UTF-8 JSON.');
    }
  } finally {
    await file.close();
  }
  if (input && typeof input === 'object') assertNoLegacyRuntimePolicy(input);
  return input;
}
