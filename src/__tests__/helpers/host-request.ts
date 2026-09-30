/**
 * One HTTP request with an explicit Host header. `fetch` forbids overriding Host,
 * so tests of Host-based refusals (DNS rebinding guards) use node:http directly.
 */
import { request } from 'node:http';

export interface HostResponse {
  status: number;
  contentType: string | undefined;
  body: string;
}

export function hostRequest(
  url: string,
  host: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<HostResponse> {
  return new Promise((resolve, reject) => {
    const sent = request(
      url,
      { method: options.method ?? 'GET', headers: { ...options.headers, host } },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            contentType: response.headers['content-type'],
            body,
          }),
        );
        response.on('error', reject);
      },
    );
    sent.on('error', reject);
    sent.end(options.body);
  });
}
