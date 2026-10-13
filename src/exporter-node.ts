/** Loaded only for the experimental exporter in a headless host. Never creates
 * a fake document/window: those change environment detection in other libraries. */
import type { ExportPlatform } from './community-exporter';

export const nodeExportPlatform: ExportPlatform = {
  prepare: prepareNodeExport,
  async decode(bytes) {
    const { default: sharp } = await import('sharp');
    const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return {
      data: new Uint8Array(decoded.data),
      width: decoded.info.width,
      height: decoded.info.height,
    };
  },
};

export async function prepareNodeExport(hasTextures: boolean): Promise<void> {
  const host = globalThis as unknown as Record<string, unknown>;
  if (!host['FileReader']) host['FileReader'] = ExportFileReader;
  if (!hasTextures || host['OffscreenCanvas'] || host['document']) return;
  const { Canvas, ImageData } = await import('@napi-rs/canvas').catch((cause: unknown) => {
    throw new Error(
      'Headless textured export requires @napi-rs/canvas. Reinstall Kiln with optional dependencies enabled, then verify the native binding in the same Node runtime and platform used by the Kiln host.',
      { cause },
    );
  });
  class ExportCanvas extends Canvas {
    constructor(width: number, height: number) {
      super(width, height);
      // Native Canvas.data() is a method, not a DataTexture image byte array.
      // Shadow it on the instance: the native constructor supplies its own prototype.
      Object.defineProperty(this, 'data', { value: undefined });
    }
    override async convertToBlob(
      options: { type?: string; mime?: string; quality?: number } = {},
    ): Promise<Blob> {
      const type = options.type ?? options.mime ?? 'image/png';
      if (type !== 'image/png' && type !== 'image/jpeg' && type !== 'image/webp')
        throw new Error(`Unsupported export image type: ${type}`);
      const bytes = type === 'image/png' ? this.toBuffer('image/png') : this.toBuffer(type);
      return new Blob([new Uint8Array(bytes)], { type });
    }
  }
  host['OffscreenCanvas'] = ExportCanvas;
  if (!host['ImageData']) host['ImageData'] = ImageData;
}

/** The exporter needs only Blob reads. This adapter is deliberately private to
 * export hosts; it does not claim to implement the full DOM FileReader API. */
export class ExportFileReader {
  result: ArrayBuffer | string | null = null;
  error: unknown = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    this.read(blob, false);
  }
  readAsDataURL(blob: Blob): void {
    this.read(blob, true);
  }

  private read(blob: Blob, dataUrl: boolean): void {
    void blob.arrayBuffer().then(
      (bytes) => {
        this.result = dataUrl
          ? `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`
          : bytes;
        this.onloadend?.();
      },
      (error: unknown) => {
        this.error = error;
        this.onerror?.();
        this.onloadend?.();
      },
    );
  }
}
