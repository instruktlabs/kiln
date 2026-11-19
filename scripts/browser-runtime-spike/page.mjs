// Page script for the browser runtime spike harness. One page load builds one asset: import
// the bundle (or start the worker), build once cold, then warm, hash each GLB with WebCrypto,
// and post the measurements back to the harness. Not part of the package.
const query = new URLSearchParams(location.search);
const index = Number(query.get('i'));
const mode = query.get('mode') ?? 'main';

const hex = (buffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));
const post = (path, body) =>
  fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function mainThreadBuilder() {
  const started = performance.now();
  const { buildProgram } = await import('/bundle/entry.js');
  const importMs = performance.now() - started;
  return {
    importMs,
    async build(code, options) {
      const t0 = performance.now();
      const result = await buildProgram(code, options);
      return { ms: performance.now() - t0, glb: result.glb, tris: result.tris };
    },
  };
}

async function workerBuilder() {
  const started = performance.now();
  const worker = new Worker('/bundle/worker.js', { type: 'module' });
  const pending = new Map();
  let nextId = 0;
  await new Promise((resolve, reject) => {
    worker.onerror = (event) => reject(new Error(event.message || 'worker failed to start'));
    worker.onmessage = (event) => {
      if (event.data?.ready) resolve();
    };
  });
  const importMs = performance.now() - started;
  worker.onmessage = (event) => {
    const { id } = event.data;
    pending.get(id)?.(event.data);
    pending.delete(id);
  };
  return {
    importMs,
    async build(code, options) {
      const id = nextId++;
      const t0 = performance.now();
      const reply = await new Promise((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ id, code, options });
      });
      const ms = performance.now() - t0;
      if (!reply.ok) throw new Error(reply.error);
      return { ms, workerMs: reply.ms, glb: new Uint8Array(reply.glb), tris: reply.tris };
    },
  };
}

async function run() {
  const job = await (await fetch(`/job/${index}`)).json();
  const out = { index, mode, id: job.id, userAgent: navigator.userAgent, runs: [] };
  out.hardwareConcurrency = navigator.hardwareConcurrency;
  out.deviceMemory = navigator.deviceMemory;
  try {
    const builder = mode === 'worker' ? await workerBuilder() : await mainThreadBuilder();
    out.importMs = builder.importMs;
    const once = async () => {
      const result = await builder.build(job.code, job.options);
      const digest = await sha256(result.glb);
      out.runs.push({
        ms: result.ms,
        workerMs: result.workerMs,
        sha256: digest,
        bytes: result.glb.byteLength,
        tris: result.tris,
      });
      return { digest, glb: result.glb };
    };
    const first = await once();
    const warm = out.runs[0].ms > job.slowMs ? job.warmRunsSlow : job.warmRuns;
    for (let i = 0; i < warm; i++) await once();
    if (job.expectedSha256 && first.digest !== job.expectedSha256) {
      // Keep the mismatching GLB for diagnosis.
      await fetch(`/glb/${index}/${mode}`, { method: 'POST', body: first.glb });
    }
  } catch (error) {
    out.error = String(error?.stack ?? error);
  }
  out.jsHeapBytes = performance.memory?.usedJSHeapSize;
  out.resources = performance
    .getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/bundle/'))
    .map((entry) => ({
      name: new URL(entry.name).pathname,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }));
  await post(`/result/${index}/${mode}`, out);
  document.title = 'done';
}

run();
