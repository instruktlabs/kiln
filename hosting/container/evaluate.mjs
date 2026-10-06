// Private one-shot entry for an externally isolated VM, never a public server.
// The outside Durable Object owns admission, network policy and the hard deadline.
// This process has no provider credentials, tenant storage or reusable state.
const MAX_INPUT = 4 * 1024 * 1024;
const MAX_OUTPUT = 8 * 1024 * 1024;

try {
  const input = Buffer.alloc(MAX_INPUT);
  let size = 0;
  for await (const chunk of process.stdin) {
    if (size + chunk.byteLength > MAX_INPUT) throw new Error('Input limit');
    input.set(chunk, size);
    size += chunk.byteLength;
  }
  const request = new TextDecoder('utf-8', { fatal: true }).decode(input.subarray(0, size));
  const { evaluateEvaluatorRequestV2 } = await import('@instruktlabs/kiln/evaluator');
  const response = await evaluateEvaluatorRequestV2(
    request,
    {},
    {
      maxResponseBytes: MAX_OUTPUT,
      deadlineMs: 60_000,
    },
  );
  if (Buffer.byteLength(response) > MAX_OUTPUT) throw new Error('Output limit');
  await new Promise((resolve, reject) => {
    process.stdout.write(response, (error) => (error ? reject(error) : resolve()));
  });
} catch {
  // Never echo the request, filesystem paths, dependency diagnostics or a stack.
  process.stderr.write('Kiln evaluator input or execution failed.\n');
  process.exitCode = 1;
}
