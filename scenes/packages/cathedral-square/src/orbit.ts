import { createRef } from 'react';
import type { RigHandle } from '@kiln-scenes/scene-kit';

/** The overview orbit, shared by the rig, the walk hand-back and the camera pad. */
export const orbitRig = createRef<RigHandle>();
