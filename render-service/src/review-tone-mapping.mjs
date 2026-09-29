// Adapted from three.js r186 neutralToneMapping; changed glare and compression
// constants for this rig. Khronos PBR Neutral construction:
// https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral
// This is deliberately named Review Neutral: it is not the unmodified Khronos mapper.
/*
The MIT License
Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
import { Fn, float, vec3, If, min, max, mix } from 'three/tsl';
import { REVIEW_NEUTRAL } from './display-transform.mjs';

export const reviewNeutralToneMapping = Fn(([input, exposure]) => {
  const { offset, startCompression: start, desaturation } = REVIEW_NEUTRAL;
  const color = vec3(input).mul(exposure).toVar();
  const minimum = min(color.r, min(color.g, color.b));
  const glare = minimum
    .lessThan(2 * offset)
    .select(minimum.sub(minimum.mul(minimum).div(4 * offset)), float(offset));
  color.subAssign(glare);
  const peak = max(color.r, max(color.g, color.b));
  // A shader return inside If needs an explicit function layout below.
  If(peak.lessThan(start), () => {
    return color;
  });
  const d = 1 - start;
  const newPeak = float(1).sub(float(d * d).div(peak.add(1 - 2 * start)));
  color.mulAssign(newPeak.div(peak));
  const whiteMix = float(1).sub(float(1).div(peak.sub(newPeak).mul(desaturation).add(1)));
  return mix(color, vec3(newPeak), whiteMix);
}).setLayout({
  name: 'reviewNeutralToneMapping',
  type: 'vec3',
  inputs: [
    { name: 'color', type: 'vec3' },
    { name: 'exposure', type: 'float' },
  ],
});
