// A weathered wooden crate.
//
// This is what a Kiln program looks like: a `meta` const, a `build()` that
// returns a scene root, and named parts you can read, diff, and edit by hand.
// Render it with:
//
//   bun run kiln render examples/crate.kiln.js --out crate.glb --views sheet.png
//
// Kiln's frame is +X forward, +Y up, +Z right. Everything sits on Y=0.

const meta = { name: 'WeatheredCrate', category: 'prop' };

function build() {
  const root = createRoot('WeatheredCrate');

  const plank = gameMaterial(0x8a6a43, { roughness: 0.85 });
  const plankDark = gameMaterial(0x6f5335, { roughness: 0.9 });
  // Metal albedo is reflectance, not paint. A metal has no diffuse term at all,
  // so its entire appearance is a specular reflection tinted by its base colour
  // -- and 0x4a4a4f, which looks like a reasonable dark iron as a swatch,
  // returns almost nothing under a neutral studio dome and rendered these bands
  // as black stripes. Real iron sits near 0x8f8f94.
  const iron = gameMaterial(0x8f8f94, { metalness: 0.8, roughness: 0.45 });

  const S = 0.9; // crate edge length
  const H = S / 2;
  const T = 0.045; // board thickness
  const BOARD = S / 3 - 0.012;
  const FACE = H + T / 2; // outer surface of a wall board
  const OUT = FACE + 0.007; // banding sits proud of the planks so it reads

  // Four walls, each three horizontal boards, so the silhouette reads as
  // planks rather than a solid cube. Axis-aligned: no rotation needed.
  const faces = [
    { name: 'Front', geo: [T, BOARD, S], at: (y) => [H, y, 0] },
    { name: 'Back', geo: [T, BOARD, S], at: (y) => [-H, y, 0] },
    { name: 'Right', geo: [S, BOARD, T], at: (y) => [0, y, H] },
    { name: 'Left', geo: [S, BOARD, T], at: (y) => [0, y, -H] },
  ];

  for (const face of faces) {
    for (let i = 0; i < 3; i++) {
      const y = H + (i - 1) * (S / 3);
      createPart(`${face.name}Board${i}`, boxGeo(face.geo[0], face.geo[1], face.geo[2]), i === 1 ? plankDark : plank, {
        position: face.at(y),
        parent: root,
      });
    }
  }

  // A liner just inside the boards. The 12 mm gaps between planks are what
  // makes this read as a crate rather than a cube, but with nothing behind them
  // they render as black slots -- the background showing through, which the eye
  // reads as a hole rather than as shadow. A real crate has its contents there.
  createPart('Liner', boxGeo(S - 2 * T, S - 2 * T, S - 2 * T), plankDark, {
    position: [0, H, 0],
    parent: root,
  });

  // Lid and floor.
  createPart('Lid', boxGeo(S - 0.01, T, S - 0.01), plank, {
    position: [0, S - T / 2, 0],
    parent: root,
  });
  createPart('Floor', boxGeo(S - 0.01, T, S - 0.01), plankDark, {
    position: [0, T / 2, 0],
    parent: root,
  });

  // Corner posts give the crate its edges and hide the panel seams.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tag = `${sx > 0 ? 'F' : 'B'}${sz > 0 ? 'R' : 'L'}`;
      createPart(`Post_${tag}`, boxGeo(0.075, S, 0.075), plankDark, {
        position: [sx * FACE, H, sz * FACE],
        parent: root,
      });
    }
  }

  // Iron banding near the top and bottom. Metal is deliberately present so the
  // GPU render path has something the flat CPU raster cannot show.
  const bands = [0.16, S - 0.16];
  for (let b = 0; b < bands.length; b++) {
    const y = bands[b];
    createPart(`BandFront${b}`, boxGeo(0.014, 0.055, S + 0.02), iron, {
      position: [OUT, y, 0],
      parent: root,
    });
    createPart(`BandBack${b}`, boxGeo(0.014, 0.055, S + 0.02), iron, {
      position: [-OUT, y, 0],
      parent: root,
    });
    createPart(`BandRight${b}`, boxGeo(S + 0.02, 0.055, 0.014), iron, {
      position: [0, y, OUT],
      parent: root,
    });
    createPart(`BandLeft${b}`, boxGeo(S + 0.02, 0.055, 0.014), iron, {
      position: [0, y, -OUT],
      parent: root,
    });
  }

  return root;
}
