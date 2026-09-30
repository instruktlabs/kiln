/** Admit a parsed resource immediately before committing it to the visible stage. */
export function acceptLoadedResource<T>(
  resource: T,
  isCurrent: () => boolean,
  release: (resource: T) => void,
): T | undefined {
  if (isCurrent()) return resource;
  release(resource);
  return undefined;
}
