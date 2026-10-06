/** Browser credentials are accepted only once, from a host-scoped cookie. */
export function browserToken(request: Request, origin: string, name: string): string | null {
  if (new URL(request.url).origin !== origin) return null;
  const header = request.headers.get('cookie') ?? '';
  if (header.length > 8192) return null;
  const values = header
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.split('=', 1)[0] === name);
  if (values.length !== 1) return null;
  const token = values[0]!.slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function randomBrowserToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export const BROWSER_COOKIE_ATTRIBUTES = 'Path=/; Secure; HttpOnly; SameSite=Lax';
