import { validateRequirementsBinding } from './requirements-context';
import { readHostRequirementsJson } from './requirements-json';
import type { RequirementsBinding } from './requirements-store';

export { CATEGORY_MIGRATION_MESSAGE } from './requirements-json';

/** An explicit CLI flag selects host policy. Merely importing an asset never calls this. */
export async function readHostRequirementsFile(path: string): Promise<RequirementsBinding> {
  return validateRequirementsBinding(await readHostRequirementsJson(path));
}
