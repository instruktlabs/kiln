/// <reference lib="dom" />
import { LOOPBACK_HOSTNAMES } from '../loopback';

export interface ChatFileHost {
  uploadFile(file: File): Promise<{ fileId: string }>;
  getFileDownloadUrl(input: { fileId: string }): Promise<{ downloadUrl: string }>;
}
export async function downloadChatFile(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  request: (method: string, params: unknown) => Promise<unknown>,
  chatHost?: ChatFileHost,
  deliveryUrl?: string,
): Promise<{ downloadUrl?: string }> {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  try {
    const result = (await request('ui/download-file', {
      contents: [
        {
          type: 'resource',
          resource: {
            uri: `file:///${filename}`,
            mimeType,
            blob: btoa(binary),
          },
        },
      ],
    })) as { isError?: boolean };
    if (result?.isError) throw new Error('The chat host could not download this file.');
    return {};
  } catch (error) {
    if ((error as { code?: number }).code !== -32601) throw error;
    if (deliveryUrl) {
      const url = new URL(deliveryUrl);
      if (
        url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && LOOPBACK_HOSTNAMES.includes(url.hostname))
      )
        throw new Error('Invalid host download URL');
      return { downloadUrl: url.href };
    }
    if (!chatHost) throw error;
    // Only runs after the user chooses a specific download. No automatic library save.
    const file = new File([Uint8Array.from(bytes)], filename, { type: mimeType });
    const { fileId } = await chatHost.uploadFile(file);
    const { downloadUrl } = await chatHost.getFileDownloadUrl({ fileId });
    if (new URL(downloadUrl).protocol !== 'https:') throw new Error('Invalid host download URL');
    return { downloadUrl };
  }
}
