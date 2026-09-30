export const workspaceSections = ['projects', 'live', 'library', 'materials'] as const;

export function initialWorkspaceSection(search: string, remembered: string | null | undefined) {
  const params = new URLSearchParams(search);
  if (params.has('asset') || params.has('open')) return 'library';
  return remembered && workspaceSections.some((section) => section === remembered)
    ? remembered
    : 'library';
}
