// Authored by: cloud-agent (FaberVi/kiln organic showcase).

const meta = { name: 'Jellyfish', category: 'prop', role: 'prop' };

function build() {
  const root = createRoot('Jellyfish');
  const bellMat = gameMaterial(0xc8b8ff, { roughness: 0.35, metalness: 0.05 });
  const tentMat = gameMaterial(0xe8e0ff, { roughness: 0.5 });
  const oralMat = gameMaterial(0xf0ecff, { roughness: 0.45 });

  const rimY = 0.31;
  const bellR = 0.11;
  const profile = [[0.006, rimY + bellR - 0.004]];
  for (let i = 1; i <= 24; i++) {
    const phi = (i / 24) * (Math.PI * 0.52);
    const squash = 0.88 - 0.12 * Math.sin(phi);
    profile.push([bellR * Math.sin(phi) * squash, rimY + bellR * Math.cos(phi) * 0.92]);
  }
  let bell = lathe(profile, 40);
  bell = displace(bell, ([x, y, z]) => {
    const rimBand = Math.max(0, (rimY + 0.025 - y) / 0.03);
    if (rimBand <= 0) return [0, 0, 0];
    const a = Math.atan2(z, x);
    const dr = 0.013 * Math.sin(a * 9 + 0.4) * rimBand * rimBand;
    const len = Math.hypot(x, z) || 1;
    return [(x / len) * dr, 0, (z / len) * dr];
  });
  createPart('Bell', bell, bellMat, { parent: root });

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.2;
    const x = Math.cos(a) * 0.035;
    const z = Math.sin(a) * 0.035;
    const oral = catmullRomPath([[x, rimY + 0.01, z], [x * 0.6, rimY - 0.04, z * 0.6], [0, rimY - 0.07, 0]], 5);
    const oralR = oral.map((_, j, arr) => 0.007 * (1 - j / (arr.length - 1)) + 0.003);
    createPart(`OralArm_${i}`, taperedTube(oral, oralR, { radialSegments: 8 }), oralMat, { parent: root });
  }

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 0.085;
    const z = Math.sin(a) * 0.085;
    const path = catmullRomPath(
      [
        [x, rimY + 0.005, z],
        [x * 1.12, 0.24, z * 1.12],
        [x * 1.05, 0.14, z * 1.05],
        [x * 0.88, 0.06, z * 0.88],
      ],
      8,
    );
    const radii = path.map((_, j, arr) => 0.011 * (1 - j / (arr.length - 1)) + 0.003);
    createPart(`Tentacle_${i}`, taperedTube(path, radii, { radialSegments: 10 }), tentMat, { parent: root });
  }
  return root;
}
