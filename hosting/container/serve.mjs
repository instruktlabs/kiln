// Private, tenant-bound coordinator. Authored source executes only through the
// fixed remote evaluator; the outside controller owns identity and VM lifetime.
try {
  const origin = process.env.KILN_PUBLIC_ORIGIN;
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.origin !== origin) throw new Error('Invalid origin');
  const { createNativeMcpHandler, loadContainerMcpRuntime } = await import('./native-mcp.mjs');
  const { createNativeHttpServer } = await import('./native-host.mjs');
  const handler = createNativeMcpHandler(await loadContainerMcpRuntime(), {
    publicOrigin: origin,
    maxConcurrent: 1,
  });
  const server = createNativeHttpServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(3000, '0.0.0.0', resolve);
  });
  const stop = () => {
    void handler.close();
    server.close(() => process.exit(0));
    server.closeAllConnections();
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
} catch {
  process.stderr.write('Kiln native host startup failed.\n');
  process.exitCode = 1;
}
