import { lstat, rename } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';

interface RenameControls {
  platform?: NodeJS.Platform;
  renameOperation?: typeof rename;
  pause?: (milliseconds: number) => Promise<unknown>;
}

/** Publish a complete directory; bounded Windows retries retain the same atomic rename. */
export async function renameDirectoryAtomically(
  source: string,
  destination: string,
  controls: RenameControls = {},
): Promise<void> {
  const renameOperation = controls.renameOperation ?? rename;
  const platform = controls.platform ?? process.platform;
  const wait = controls.pause ?? pause;
  const delays = [20, 50, 100, 200, 400];
  for (let attempt = 0; ; attempt++) {
    try {
      await renameOperation(source, destination);
      return;
    } catch (error) {
      const delay = delays[attempt];
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (
        platform !== 'win32' ||
        delay === undefined ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')
      )
        throw error;
      // A destination can be a legitimate concurrent/idempotent import. Leave
      // that decision to the caller; never remove, replace or copy over it.
      const absent = await lstat(destination).then(
        () => false,
        (statError: NodeJS.ErrnoException) => statError.code === 'ENOENT',
      );
      if (!absent) throw error;
      // File scanners can briefly deny renaming a newly written directory.
      // Persistent permission failures still surface after at most 770 ms.
      await wait(delay);
    }
  }
}
