/** Consume ordinary slow frames in bounded simulation slices, not slow motion.
 * Stalls beyond 250ms discard excess time to avoid an unbounded catch-up burst.
 * The returned frame is borrowed and reused until the next call.
 */
export function createSimulationFrame(){
 const frame={elapsed:0,count:1,step:0,dropped:0};
 return delta=>{if(!Number.isFinite(delta)||delta<0)throw new RangeError('Finite nonnegative frame interval required');frame.elapsed=Math.min(delta,.25);frame.count=Math.max(1,Math.ceil(frame.elapsed*60));frame.step=frame.elapsed/frame.count;frame.dropped=delta-frame.elapsed;return frame;};
}
