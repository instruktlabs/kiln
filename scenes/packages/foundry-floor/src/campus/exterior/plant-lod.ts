// SPDX-License-Identifier: MIT
import { selectCellLod } from '@kiln-scenes/scene-kit';

/** Height as a fraction of the current vertical view. Major silhouette changes stay small on screen.
 * The quality governor may reduce distant detail, but cannot move the main transition back into the foreground.
 * The two saved lower levels remain useful for the distant campus; no asset geometry is changed. */
export function plantLod(projectedHeight:number,lodBias:number,current:number):number {
  const bias=Math.max(.75,Math.min(1,lodBias));
  return selectCellLod(1/Math.max(1e-9,projectedHeight),[bias/.05,bias/.012,Infinity],current,.12);
}
