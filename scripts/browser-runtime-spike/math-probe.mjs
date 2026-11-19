// Which Math functions return different bits in two JavaScript engines? Prints one line per
// function: a checksum of its results over a fixed input set (no randomness) and, as a
// sample, the first 3 inputs whose results are recorded. Run it in Node, and in Chrome
// through math-probe.html, then compare the lines. Not part of the package.
export function mathProbe() {
  const inputs = [];
  // Deterministic inputs across the ranges geometry code uses: angles, unit values, lengths.
  for (let i = 0; i < 20000; i++) {
    const t = i / 20000;
    inputs.push(t * 2 * Math.PI, (t - 0.5) * 2, t * 100 + 0.001, (i * 0.618033988749895) % 7);
  }
  const unary = [
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'exp',
    'log',
    'sqrt',
    'cbrt',
    'sinh',
    'cosh',
    'tanh',
    'log2',
    'log10',
    'expm1',
    'log1p',
    'asinh',
    'acosh',
    'atanh',
  ];
  const lines = [];
  const buffer = new Float64Array(1);
  const words = new Uint32Array(buffer.buffer);
  const checksum = (fn) => {
    let a = 0x811c9dc5;
    for (const value of inputs) {
      const result = fn(value);
      // NaN payloads are not observable from JavaScript arithmetic; count every NaN as one value.
      buffer[0] = Number.isNaN(result) ? Number.NaN : result;
      if (Number.isNaN(result)) words[0] = words[1] = 0x7ff80000;
      a = Math.imul(a ^ words[0], 0x01000193) >>> 0;
      a = Math.imul(a ^ words[1], 0x01000193) >>> 0;
    }
    return a.toString(16).padStart(8, '0');
  };
  for (const name of unary) lines.push(`${name} ${checksum(Math[name])}`);
  // A readable sample: sin and cos at five angles, as exact decimal strings.
  for (const x of [0.1, 1, 2.5, Math.PI / 3, 10])
    lines.push(`sample sin(${x}) ${Math.sin(x)} cos ${Math.cos(x)}`);
  lines.push(`atan2 ${checksum((x) => Math.atan2(x, 1.3 - x))}`);
  lines.push(`pow ${checksum((x) => (Math.abs(x) + 0.1) ** 1.7)}`);
  lines.push(`pow-int ${checksum((x) => (x + 0.1) ** 3)}`);
  lines.push(`hypot ${checksum((x) => Math.hypot(x, 1 - x, 0.5 * x))}`);
  return lines.join('\n');
}

if (typeof process !== 'undefined' && process.argv[1]?.endsWith('math-probe.mjs'))
  console.log(mathProbe());
