/**
 * The sky as colours, with no renderer: the dome is painted from it, and so is the small picture
 * the window glass reflects. Colours here are linear; an hour states its colours in sRGB.
 */
import type { Hour } from './light';

export type Rgb = [number, number, number];

export const toLinear = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
export const toSrgb = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);
const linear = (rgb: readonly number[]): Rgb => [toLinear(rgb[0]!), toLinear(rgb[1]!), toLinear(rgb[2]!)];

export interface SkyPaint { horizon: Rgb; zenith: Rgb; glow: Rgb; street: Rgb; sun: Rgb }

export function skyPaint(hour: Hour): SkyPaint {
  return { horizon: linear(hour.horizon), zenith: linear(hour.zenith), glow: linear(hour.skyGlow), street: linear(hour.street), sun: hour.sun };
}

/** The sky in a unit direction: the horizon colour low down, the zenith overhead, a glow round the sun. */
export function skyAt(paint: SkyPaint, x: number, y: number, z: number, out: Rgb): Rgb {
  const height = Math.max(0, y), rise = height ** 0.55;
  const toward = Math.max(0, x * paint.sun[0] + y * paint.sun[1] + z * paint.sun[2]);
  const halo = (toward ** 6 * 0.55 + toward ** 48 * 1.4) * (1 - 0.5 * height);
  for (let c = 0; c < 3; c++) out[c] = paint.horizon[c]! + (paint.zenith[c]! - paint.horizon[c]!) * rise + paint.glow[c]! * halo;
  return out;
}

/** Where a reflection stops showing the street and starts showing sky, as the sine of its elevation. */
const STREET_TOP = 0.06, SKY_FROM = 0.34;

/** What glass shows in a unit direction: the lit street opposite at eye level, the sky above the roofs. */
export function reflectionAt(paint: SkyPaint, x: number, y: number, z: number, out: Rgb): Rgb {
  if (y <= STREET_TOP) { out[0] = paint.street[0]; out[1] = paint.street[1]; out[2] = paint.street[2]; return out; }
  skyAt(paint, x, y, z, out);
  if (y >= SKY_FROM) return out;
  const k = (y - STREET_TOP) / (SKY_FROM - STREET_TOP), t = k * k * (3 - 2 * k);
  for (let c = 0; c < 3; c++) out[c] = paint.street[c]! + (out[c]! - paint.street[c]!) * t;
  return out;
}

/**
 * The reflection picture as sRGB bytes, RGBA, `width` by `height`, laid out the way three reads an
 * equirectangular map: columns run round the compass from -X, rows from straight down to straight up.
 */
export function paintReflection(hour: Hour, width: number, height: number, out: Uint8Array): Uint8Array {
  const paint = skyPaint(hour), rgb: Rgb = [0, 0, 0];
  for (let j = 0; j < height; j++) {
    const lift = ((j + 0.5) / height - 0.5) * Math.PI, y = Math.sin(lift), flat = Math.cos(lift);
    for (let i = 0; i < width; i++) {
      const turn = ((i + 0.5) / width - 0.5) * Math.PI * 2;
      reflectionAt(paint, flat * Math.cos(turn), y, flat * Math.sin(turn), rgb);
      const at = (j * width + i) * 4;
      for (let c = 0; c < 3; c++) out[at + c] = Math.round(Math.min(1, Math.max(0, toSrgb(rgb[c]!))) * 255);
      out[at + 3] = 255;
    }
  }
  return out;
}
