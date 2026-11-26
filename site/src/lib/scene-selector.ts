import { sceneBrowseGroups } from '../data/scenes';
import { holodeckWorldUrl } from './holodeck';
import { curatedWorlds } from './site-curation';

export interface SceneOption {
  id: string;
  name: string;
  href: string;
}
export interface SceneOptionGroup {
  label: string;
  options: SceneOption[];
}

/**
 * The scene dropdown's groups, in the order the Scenes page shows them: the current Kiln scenes, the worlds on
 * Holodeck, then the earlier Kiln scenes. A build without packs shows no Holodeck worlds, so it lists none.
 */
export function sceneSelectorGroups(packsEnabled: boolean): SceneOptionGroup[] {
  const local = sceneBrowseGroups(packsEnabled).map((group) => ({
    id: group.id,
    label: group.label,
    options: group.scenes.map((scene) => ({ id: scene.id, name: scene.name, href: scene.href })),
  }));
  const worlds = {
    label: 'Holodeck worlds',
    options: curatedWorlds.map((pack) => ({
      id: pack.id,
      name: pack.name,
      href: holodeckWorldUrl(pack.id),
    })),
  };
  return local.flatMap((group) => [
    ...(packsEnabled && group.id === 'earlier-kiln-scenes' ? [worlds] : []),
    { label: group.label, options: group.options },
  ]);
}
