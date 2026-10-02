interface FoundryInventory {
  assetCount: number;
  placedInScene: number;
  assets: readonly { group: string }[];
}

/** Inventory establishes campus content; only the explicit runtime release establishes review2 controls/loading. */
export function foundryPresentation(pack: FoundryInventory, runtimeRelease?: string) {
  const hasCampus = pack.assets.some((asset) => asset.group === 'campus');
  const registeredFloor = hasCampus && runtimeRelease === 'ff3-review2';
  const unplaced = pack.assetCount - pack.placedInScene;
  return {
    metadata: hasCampus
      ? 'Explore a fictional chip fab and planted campus, with traffic and wafer transport driven by its simulation.'
      : 'Explore a fictional chip fab’s pilot line, with wafer lots and overhead transport driven by its simulation.',
    description: registeredFloor
      ? `A fictional chip fab and campus, arranged from ${pack.placedInScene} Kiln-authored models. Explore the planted grounds, road and freight traffic, then visit a working level-1 cutaway inside the south-west building.`
      : hasCampus
        ? `A fictional chip fab and campus, arranged from ${pack.placedInScene} Kiln-authored models. Explore the planted grounds, road and freight traffic, then enter the fab to follow its wafer lots and transport.`
        : `An interior: a lot-level twin of a fictional chip fab’s pilot line, arranged from ${pack.placedInScene} of the pack’s ${pack.assetCount} models. Walk the fab floor, take a tour of seven views, open a tool’s panel or follow a wafer lot.`,
    factory: hasCampus
      ? 'Wafer lots queue, ride the overhead transport, wait in stockers and run on tools. AMRs carry actual lots between the metrology and probe ports and stockers; arms lift and set the FOUP at each handoff. Humanoid work robots handle repair and preventive maintenance; technicians handle tool qualification. Panels and status lines read from this model. Its figures describe a fictional pilot line, not a real fab, and calibration remains open.'
      : 'The scene is an interior: a lot-level twin of a pilot line. Wafer lots queue, ride the overhead transport, wait in stockers and run on the tools, and every panel and status line is read from the twin’s state. The figures come from the twin’s own model, not from any real fab, and its calibration is still open.',
    controls: registeredFloor
      ? 'Drive the sedan with the keyboard and hold Shift to boost. Touch controls provide separate steering, throttle, brake / reverse and Boost. Enter the fab stays visible outside, and Exit to campus stays visible inside. Walk the floor or visitor gallery, tour the named views, inspect a tool or stocker, follow a wafer lot or floor transfer, and pause or change the simulation speed.'
      : hasCampus
        ? 'Explore the campus views or Drive the sedan, and enter the fab at Arrival. Inside, walk the floor and visitor gallery, tour the named views, inspect a tool or stocker, follow a wafer lot or a floor transfer, and pause or change the simulation speed. The scene lists its controls beside each view.'
        : 'Walk the fab floor and the visitor gallery, take the tour of seven views, open the panel of a tool or stocker, or follow a wafer lot from tool to tool. The controls are listed inside the scene.',
    foundation: `The ${hasCampus ? 'fab and campus are' : 'fab is'} arranged from ${pack.placedInScene} of the pack’s ${pack.assetCount} Kiln-authored models.${unplaced ? ` The other ${unplaced} are in the pack but not placed.` : ''}${registeredFloor ? ' The interior occupies level 1 of the south-west building. Entry transitions from the entrance to level 1, with the surrounding building shown as a cutaway. Tree detail follows its size on screen; a small transition buffer prevents repeated switching near a boundary.' : ''} The notices under Explore name the software, and the asset licence names every model.`,
    loading: registeredFloor
      ? 'The campus loads when you choose Explore. The fab interior loads when you choose Enter the fab.'
      : 'Loads only when you choose Explore.',
  };
}
