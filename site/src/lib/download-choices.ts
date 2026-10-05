export interface DownloadFile {
  url: string;
  bytes: number;
  sha256: string;
}

export function buildDownloadChoices(runtime: DownloadFile, editable: DownloadFile) {
  return [
    {
      ...runtime,
      profile: 'runtime',
      label: 'Runtime assets',
      description: 'Models, textures and animations prepared for use in a scene or application.',
    },
    {
      ...editable,
      profile: 'editable',
      label: 'Editable assets',
      description:
        'Models plus Kiln source, editing metadata, materials and included revisions, so you can reopen and continue editing.',
    },
  ] as const;
}
