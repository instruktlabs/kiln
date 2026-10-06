// One bounded request in a disposable software-rendering VM. No source execution,
// storage, provider credentials or listening server is exposed by this entry.
try {
  const { decodeRenderRequest, encodeRenderResult, RENDER_LIMITS } = await import(
    './native-render.mjs'
  );
  const bytes = Buffer.alloc(RENDER_LIMITS.requestBytes);
  let length = 0;
  for await (const chunk of process.stdin) {
    if (length + chunk.byteLength > bytes.byteLength) throw new Error('Input limit');
    bytes.set(chunk, length);
    length += chunk.byteLength;
  }
  const input = decodeRenderRequest(bytes.subarray(0, length));
  const engine = new URL(import.meta.resolve('@instruktlabs/kiln'));
  const service = (name) => new URL(`../render-service/src/${name}.mjs`, engine).href;
  const { validateSelfContainedGlb } = await import(service('glb-input'));
  const { validateRenderMode } = await import(service('contract'));
  const { glb, ...options } = input.request;
  validateSelfContainedGlb(glb, { maxGlbBytes: RENDER_LIMITS.glbBytes });
  validateRenderMode({
    views: options.viewDirs,
    size: options.size,
    beauty_size: options.beautySize,
    cameras: options.cameras,
    width: options.width,
    height: options.height,
    lighting_preset_id: options.lightingPresetId,
    backdrop: options.backdrop,
  });
  // Cloudflare exec does not inherit image environment variables. Select the
  // reviewed software ICD here, never from request fields or ambient GPU choice.
  process.env.VK_ICD_FILENAMES = '/opt/kiln/lvp-icd.json';
  await import(service('register-hooks'));
  const { initRenderer, renderGlb } = await import(service('renderer'));
  const gpu = await import(service('gpu'));
  await initRenderer({ allowSoftware: true });
  const device = await gpu.acquireGpu();
  if (device.software !== true || device.backend !== 'vulkan')
    throw new Error('Unexpected renderer');
  const result = await renderGlb(glb, options);
  const output = encodeRenderResult(input, {
    ...result,
    rendererId: device.rendererId,
    backend: device.backend,
    software: true,
  });
  gpu.markGpuShutdown();
  device.device.destroy();
  await new Promise((resolve, reject) =>
    process.stdout.write(output, (error) => (error ? reject(error) : resolve())),
  );
  process.exit(0);
} catch {
  await new Promise((resolve) =>
    process.stderr.write('Kiln software render input or execution failed.\n', resolve),
  );
  process.exit(1);
}
