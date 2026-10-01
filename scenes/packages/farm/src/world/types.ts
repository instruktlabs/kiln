import type { AnimationAction, AnimationClip, AnimationMixer, Group } from 'three/webgpu';

export type FarmPoint = [number, number, number];
export interface LayoutPlacement {
  id: string;
  asset: string;
  position: FarmPoint;
  yaw: number;
  omittedPartPaths?: string[];
  soilMode?: 'terrain' | 'model';
  repeat?: { count: number; step: FarmPoint };
}
export interface LayoutView {
  position: FarmPoint;
  target: FarmPoint;
  fov?: number;
  interior?: boolean;
  asset?: string;
}
export interface LayoutPatch { width: number; depth: number; position: FarmPoint }
export interface FarmLayout {
  version: number;
  name: string;
  sizeMeters: number;
  note: string;
  placements: LayoutPlacement[];
  presentation: {
    paths: LayoutPatch[];
    beds: (LayoutPatch & { id: string })[];
    river: { millX: number; millZ: number; waterY: number };
    grass: { tufts: number; seed: number; quality: number[] };
  };
  views: Record<string, LayoutView>;
  route: Pick<LayoutView, 'position' | 'target'>[];
}
/** Runtime only needs identity; the loaded pack retains complete authored metadata. */
export interface FarmAsset { id: string; name?: string }
export interface FarmInstance {
  id: string;
  asset: FarmAsset;
  /** Placement wrapper: remains a direct world-root child after assembly. */
  object: Group;
  soilVisible?: boolean;
  mixer: AnimationMixer;
  clips: AnimationClip[];
  action: AnimationAction | null;
  clipIndex: string;
}
