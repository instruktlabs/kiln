/// <reference lib="dom" />
export const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
export function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
}
export function notice(error: unknown) {
  const target = el('dashboard-status');
  target.textContent = error instanceof Error ? error.message : String(error);
  target.hidden = !target.textContent;
}
export async function request<T>(
  path: string,
  options?: { method: string; body: unknown },
): Promise<T> {
  const response = await fetch(
    path,
    options
      ? {
          method: options.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options.body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}
export function empty(title: string, description: string) {
  const box = node('div', undefined, 'empty');
  box.append(node('b', title), node('p', description));
  return box;
}
export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Optional browser preferences. */
  }
}
export function recall(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function shortId(id?: string) {
  return id ? id.slice(0, 15) : 'Unspecified';
}
export function recordDetails(title: string, value: unknown) {
  const details = node('details', undefined, 'record-details');
  details.append(node('summary', title), node('pre', JSON.stringify(value, null, 2)));
  return details;
}
