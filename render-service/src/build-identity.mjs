import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fingerprintSourceDir } from './instance.mjs';

export const RENDER_SERVICE_PROTOCOL = 'kiln.render-service.v2';
export const RENDER_SERVICE_DEPENDENCIES = Object.freeze({
  three: '0.186.1',
  webgpu: '0.6.2',
  pngjs: '7.0.0',
});
export const REQUIRED_RENDER_CAPABILITIES = Object.freeze([
  'render.input.self-contained-v1',
  'render.queue.cancellation-v1',
  'render.fidelity.v1',
]);

export function compatibilityFingerprint({ sourceFingerprint, dependencies }) {
  if (typeof sourceFingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(sourceFingerprint))
    throw new Error('Invalid renderer source fingerprint');
  const pins = Object.fromEntries(
    Object.keys(RENDER_SERVICE_DEPENDENCIES)
      .sort()
      .map((name) => {
        if (typeof dependencies?.[name] !== 'string' || !dependencies[name])
          throw new Error(`Missing renderer dependency identity: ${name}`);
        return [name, dependencies[name]];
      }),
  );
  return `sha256:${createHash('sha256')
    .update(
      JSON.stringify({
        version: 'kiln.render-service-build.v1',
        sourceFingerprint,
        dependencies: pins,
      }),
    )
    .digest('hex')}`;
}

export function buildCompatibility({ sourceDir, dependencies }) {
  const sourceFingerprint = fingerprintSourceDir(sourceDir);
  return Object.freeze({
    version: 'kiln.render-service-build.v1',
    sourceFingerprint,
    dependencies: Object.freeze({ ...dependencies }),
    fingerprint: compatibilityFingerprint({ sourceFingerprint, dependencies }),
  });
}

/** Resolve the executed package graph, including hoisted installations. Does not load native code. */
export function resolvedRendererDependencies(anchorUrl = import.meta.url) {
  const require = createRequire(anchorUrl);
  return Object.fromEntries(
    Object.entries(RENDER_SERVICE_DEPENDENCIES).map(([name, expected]) => {
      let dir;
      try {
        dir = dirname(require.resolve(name));
      } catch {
        throw new Error(`Renderer dependency ${name}@${expected} is not installed`);
      }
      let found;
      for (;;) {
        try {
          const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
          if (pkg.name === name) {
            found = pkg.version;
            break;
          }
        } catch {}
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      if (found !== expected)
        throw new Error(
          `Renderer dependency ${name} version conflict: expected ${expected}, resolved ${found ?? 'unknown'}`,
        );
      return [name, found];
    }),
  );
}
