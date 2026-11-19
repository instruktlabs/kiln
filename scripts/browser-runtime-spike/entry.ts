// Browser runtime spike (#377): the build path only. Source in, GLB bytes out; no views, no
// QA images, no host services. Bundled by ./bundle.mjs for the browser and for Node, so both
// sides of the byte-equality check run the same engine modules. Not part of the package.
import './prelude.mjs';
import { type RenderGlbOptions, renderGLBInProcess } from '../../src/render';

export interface SpikeBuildResult {
  glb: Uint8Array;
  artifactGlbSha256: string;
  tris: number;
  warnings: string[];
  params?: unknown;
}

export async function buildProgram(
  code: string,
  options: RenderGlbOptions = {},
): Promise<SpikeBuildResult> {
  const result = await renderGLBInProcess(code, options);
  return {
    glb: new Uint8Array(result.glb.buffer, result.glb.byteOffset, result.glb.byteLength),
    artifactGlbSha256: result.artifactGlbSha256,
    tris: result.tris,
    warnings: result.warnings ?? [],
    ...(result.params ? { params: result.params } : {}),
  };
}
