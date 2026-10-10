/// <reference lib="dom" />
import { createAssetStage } from './scene';
import { encodeAssetBundle, type AssetRecord } from '../assets';
import { downloadChatFile, type ChatFileHost } from './chat-download';
import { decodeWidgetAsset } from '../widget-transfer';
import { assetAttributionRows } from './attribution';

declare global {
  interface Window {
    openai?: ChatFileHost & { openExternal?(input: { href: string }): void };
  }
}

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element('status');
let record: AssetRecord | undefined;
let downloadUrls: Record<string, string> = {};
let stage: ReturnType<typeof createAssetStage> | undefined;
let sequence = 0;
let presentationRevision = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
function request(method: string, params: unknown): Promise<unknown> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Chat host did not respond.'));
    }, 20000);
    pending.set(id, {
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      },
    });
    window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
  });
}
function notify(method: string, params: unknown = {}) {
  window.parent.postMessage({ jsonrpc: '2.0', method, params }, '*');
}
function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
async function show(input: unknown) {
  const revision = ++presentationRevision;
  record = undefined;
  element('stats').textContent = '';
  element<HTMLSelectElement>('clips').hidden = true;
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-download]'))
    button.disabled = true;
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Asset transfer metadata is missing. Present the saved asset again.');
    await showResult(input, revision);
  } catch (error) {
    if (revision !== presentationRevision) return;
    status.textContent =
      error instanceof Error
        ? error.message
        : 'Asset transfer failed. Present the saved asset again.';
  }
}
async function showResult(
  result: {
    isError?: boolean;
    content?: { type: string; text?: string }[];
    _meta?: { kilnAsset?: unknown };
  },
  revision: number,
) {
  if (result.isError) {
    status.textContent =
      result.content?.find((item) => item.type === 'text')?.text ??
      'This asset could not be opened.';
    return;
  }
  let received: Awaited<ReturnType<typeof decodeWidgetAsset>>;
  try {
    received = await decodeWidgetAsset(result._meta?.kilnAsset);
  } catch (error) {
    if (revision !== presentationRevision) return;
    status.textContent =
      error instanceof Error
        ? error.message
        : 'Asset transfer failed. Present the saved asset again.';
    return;
  }
  if (revision !== presentationRevision) return;
  record = received.record;
  element('name').textContent = record.manifest.name;
  downloadUrls = received.downloadUrls;
  element('revision').textContent =
    `${record.manifest.editable ? 'Editable source included' : 'GLB asset'} · ${record.manifest.revisionId.slice(0, 10)}`;
  element('attribution').textContent = assetAttributionRows(record.manifest)
    .map(({ label, value }) => `${label}: ${value}`)
    .join(' · ');
  try {
    stage ??= createAssetStage(element('stage'));
    const stats = await stage.load(record.files['asset.glb']!);
    if (revision !== presentationRevision) return;
    if (stats) {
      element('stats').textContent =
        `${stats.triangles.toLocaleString()} triangles · ${stats.materials} materials · ${(record.files['asset.glb']!.length / 1024).toFixed(0)} KB`;
      const clips = element<HTMLSelectElement>('clips');
      clips.replaceChildren(
        new Option('Rest pose', '-1'),
        ...stats.clips.map((name, i) => new Option(name, String(i))),
      );
      clips.hidden = !stats.clips.length;
    }
    status.textContent = 'Drag to orbit · Scroll to zoom';
  } catch (error) {
    if (revision !== presentationRevision) return;
    stage?.dispose();
    stage = undefined;
    const preview = record.files['preview.png'];
    if (preview) {
      const image = new Image();
      image.alt = `${record.manifest.name} · saved preview image`;
      image.src = `data:image/png;base64,${encode(preview)}`;
      element('stage').replaceChildren(image);
    }
    status.textContent = `${preview ? 'Showing saved preview. ' : ''}3D preview unavailable: ${String(error)}`;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-download]'))
    button.disabled = false;
  element<HTMLButtonElement>('source').hidden = !record.files['source.kiln.js'];
}
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
  const message = event.data;
  if (message.id !== undefined && !message.method) {
    const callback = pending.get(message.id);
    pending.delete(message.id);
    if (message.error)
      callback?.reject(
        Object.assign(new Error(message.error.message), { code: message.error.code }),
      );
    else callback?.resolve(message.result);
  }
  if (message.method === 'ui/notifications/tool-result') void show(message.params);
  if (message.method === 'ui/resource-teardown') {
    stage?.dispose();
    window.parent.postMessage({ jsonrpc: '2.0', id: message.id, result: {} }, '*');
  }
});
element('reset').onclick = () => stage?.reset();
element<HTMLSelectElement>('clips').onchange = (event) =>
  stage?.clip(Number((event.target as HTMLSelectElement).value));
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-download]')) {
  button.onclick = async () => {
    if (!record) return;
    const downloadRevision = presentationRevision;
    const kind = button.dataset.download!;
    const filename =
      kind === 'bundle' ? 'editable.zip' : kind === 'source' ? 'source.kiln.js' : 'asset.glb';
    const bytes = kind === 'bundle' ? encodeAssetBundle([record]) : record.files[filename]!;
    const mimeType =
      kind === 'bundle'
        ? 'application/zip'
        : kind === 'source'
          ? 'text/javascript'
          : 'model/gltf-binary';
    const slug = record.manifest.name.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
    button.disabled = true;
    status.textContent = 'Requesting download…';
    try {
      const host =
        typeof window.openai?.uploadFile === 'function' &&
        typeof window.openai?.getFileDownloadUrl === 'function'
          ? window.openai
          : undefined;
      const result = await downloadChatFile(
        bytes,
        `${slug}-${filename}`,
        mimeType,
        request,
        host,
        downloadUrls[filename],
      );
      if (downloadRevision !== presentationRevision) return;
      if (result.downloadUrl) {
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.textContent = `Save ${slug}-${filename}`;
        link.style.color = '#d5f4a2';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.onclick = (event) => {
          if (window.openai?.openExternal) {
            event.preventDefault();
            window.openai.openExternal({ href: result.downloadUrl! });
          }
        };
        status.replaceChildren('Download ready. ', link);
      } else status.textContent = 'Download requested.';
    } catch (error) {
      if (downloadRevision === presentationRevision)
        status.textContent = `Download unavailable in this host: ${(error as Error).message}`;
    } finally {
      button.disabled = !record || downloadRevision !== presentationRevision;
    }
  };
}
void request('ui/initialize', {
  appInfo: { name: 'Kiln Asset Viewer', version: '0.6.0' },
  appCapabilities: {},
  protocolVersion: '2026-01-26',
})
  .then(() => {
    notify('ui/notifications/initialized');
    notify('ui/notifications/size-changed', {
      height: document.documentElement.scrollHeight,
    });
  })
  .catch((error) => {
    status.textContent = error.message;
  });
