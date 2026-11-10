/** Types for the film town generator copied into `town-layout.js`. */
export interface TownPlacement {
  key: string;
  x: number;
  z: number;
  y?: number;
  rotation: number;
  scale?: number;
  variant?: number;
}

export interface TownStreet {
  line: string;
  step: number;
  a: [number, number];
  b: [number, number];
  width: number;
  core: boolean;
  lane: boolean;
}

export interface TownBlock {
  corners: [number, number][];
  core: boolean;
  garden: boolean;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface TownLayout {
  houses: TownPlacement[];
  props: TownPlacement[];
  lights: [number, number, number][];
  paving: {
    cobbles: ([number, number][] | null)[];
    flags: ([number, number][] | null)[];
    soil: ([number, number][] | null)[];
    granite: ([number, number][] | null)[];
  };
  blocks: TownBlock[];
  streets: TownStreet[];
}

export function townLayout(options?: { seed?: number }): TownLayout;
