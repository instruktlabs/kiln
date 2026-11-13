// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
// A small textured structure: the kind of thing people actually generate.
//
// Three real PBR materials with bound Poly Haven albedo/normal/ARM maps — brick
// stone, weathered wood, painted iron. On the CPU rasterizer this reads as three
// flat greys; the texture and normal detail only exist in a GPU render.
const meta = { name: 'StoneWell', category: 'environment', role: 'poi' };

async function build() {
  const root = createRoot('StoneWell');

  const stone = await materialRecipe('kiln.material.stone.v1', {
    textureResources: {
      baseColor: 'kiln.texture.brick-wall-albedo.v1',
      normal: 'kiln.texture.brick-wall-normal.v1',
      metallicRoughness: 'kiln.texture.brick-wall-arm.v1',
    },
  });
  // Every material carries a full albedo/normal/ARM stack, deliberately. A flat
  // baseColor here would render as plastic next to the textured curb -- and it
  // would undercut the point the contact sheet is making, since half the asset
  // would show no material information even on the GPU.
  // No baseColor tint on the textured materials: the recipe multiplies the tint
  // into the albedo, so a dark brown here crushes the plank texture to near-black
  // in the flat orthographic cells. Let the map carry the colour.
  const wood = await materialRecipe('kiln.material.wood.v1', {
    textureResources: {
      baseColor: 'kiln.texture.weathered-planks-albedo.v1',
      normal: 'kiln.texture.weathered-planks-normal.v1',
      metallicRoughness: 'kiln.texture.weathered-planks-arm.v1',
    },
  });
  // Iron stays untextured on purpose. The rusted-metal stack was tried here and
  // read as a glowing red bar on a part this thin -- worse than the flat metal it
  // replaced. Not every surface needs a map; the material story is carried by the
  // stone and the planks, and forcing a texture onto the windlass hurt the sheet.
  const iron = await materialRecipe('kiln.material.painted-metal.v1', {
    baseColor: '#3f4348',
    roughness: 0.42,
    metalness: 0.9,
  });

  // Curb: two courses of masonry, laid the way masonry is actually laid.
  //
  // The obvious way to ring a circle with stones is a box per segment, rotated
  // to face outward. It does not work, and the reason is worth keeping: a box
  // has parallel sides, so on a circle its two neighbours meet it at an angle
  // and the joint opens into a V that widens toward the outside face. Sixteen
  // of those read as a cog wheel with a dark slot at every tooth. A real curb
  // stone is a wedge -- its side faces lie on radial planes through the axis,
  // so a neighbour meets it flat, and its inner and outer faces follow the
  // curve instead of cutting across it.
  const R_IN = 0.57;
  const R_OUT = 0.87;
  const R_MID = (R_IN + R_OUT) / 2;
  const SEGMENTS = 16;
  const COURSE_H = 0.23;
  const step = (Math.PI * 2) / SEGMENTS;
  // A joint you can see. Radial faces that meet exactly would be coincident and
  // z-fight, and dry masonry has a mortar line anyway; 3 mm at the outer face.
  const half = step / 2 - 0.003 / R_OUT;

  // The footprint of one stone, in plan: u is world X, v is world Z, and the
  // extrusion runs up Y. The arcs carry an extra sample each so the faces bend
  // with the ring rather than chording across it.
  const arc = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
  const stoneProfile = [
    arc(R_IN, -half),
    arc(R_OUT, -half),
    arc(R_OUT, -half / 2),
    arc(R_OUT, 0),
    arc(R_OUT, half / 2),
    arc(R_OUT, half),
    arc(R_IN, half),
    arc(R_IN, half / 2),
    arc(R_IN, 0),
    arc(R_IN, -half / 2),
  ];
  // One geometry, thirty-two meshes. Every stone in a course is the same stone
  // turned to its own angle, which is both what a mason would cut and what
  // keeps this under a thousand triangles.
  // extrudeProfile returns bare geometry with no UVs, and a texture-backed
  // material on unwrapped geometry is a QA blocker, not a silent miss. Use the
  // explicit cylindrical projection: U spans this stone's arc and V its height.
  // Keeping the angular range explicit avoids stretching a narrow arc over a
  // whole revolution. Projection returns owned buffers.
  const curbGeo = projectUV(await extrudeProfile(stoneProfile, { depth: COURSE_H, axis: 'y' }), {
    projection: 'cylindrical', angularRange: [-half * 180 / Math.PI, 2 * half * 180 / Math.PI],
  });

  // Where the posts go, and why the curb has to know about it before it is laid.
  //
  // A post that stops on the curb's top face is resting on the wall, not built
  // into it: from any angle where the wall curves away the timber reads as
  // overhanging the stone, because a square post on a round wall always will.
  // Masonry solves this by leaving a socket -- the post runs past the courses to
  // the plinth and the stones on its line are cut around it. So the sockets are
  // modelled first, as ordinary solids, and subtracted from the few stones that
  // meet them.
  const POST = R_MID;
  const POST_W = 0.13;
  const POST_TOP = 1.76;
  const BASE_TOP = 0.10;
  const sockets = [-1, 1].map((sz) =>
    createPart(`Socket_${sz > 0 ? 'R' : 'L'}`, boxGeo(POST_W + 0.008, 0.62, POST_W + 0.008), iron, {
      position: [0, BASE_TOP + 0.31, sz * POST],
    }),
  );

  // Which stones are on that line. A stone spans `half` either side of its own
  // angle; the post reaches `postReach` either side of its post's. Overlap is
  // the sum, and the answer is one stone per post in the un-skewed course and
  // two in the skewed one, where the post straddles a joint. Everything else is
  // laid as a plain instance, which is the point of doing the test at all.
  const postReach = Math.atan2(POST_W / 2 + 0.02, POST - POST_W / 2);
  const meetsPost = (a) =>
    [Math.PI / 2, -Math.PI / 2].some((p) => {
      const d = Math.abs((((a - p + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
      return d < half + postReach;
    });

  for (let course = 0; course < 2; course++) {
    // Break the joints. Both courses use the same sixteen positions offset by
    // half a step, so no joint runs the full height of the curb -- which is the
    // whole reason masonry is coursed and the thing the eye reads as "built".
    const skew = course * (step / 2);
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = i * step + skew;
      const block = createPart(`Curb_${course}_${i}`, curbGeo, stone, {
        position: [0, course * COURSE_H, 0],
      });
      block.rotation.y = -angle;
      if (!meetsPost(angle)) {
        root.add(block);
        continue;
      }
      // CSG bakes the world transform into the result and drops the UVs, so the
      // projection runs again in the baked frame. Preserve the original stone's
      // angular range instead of stretching each notched remnant independently.
      const notched = await boolDiff(`Curb_${course}_${i}`, block, ...sockets);
      notched.geometry = projectUV(notched.geometry, {
        projection: 'cylindrical', angularRange: [(angle - half) * 180 / Math.PI, 2 * half * 180 / Math.PI],
      });
      root.add(notched);
    }
  }

  // The shaft lining: a pipe, not a cylinder. cylinderGeo is a solid, and a
  // solid here fills the well -- the hole is the whole point of a well. An
  // extruded ring with a hole in its profile is the shape that was wanted, and
  // it sits 5 mm behind the stones so the mortar joints show lining rather than
  // daylight without the two surfaces fighting over the same pixels.
  const circle = (r) =>
    Array.from({ length: 32 }, (_, i) => arc(r, (i / 32) * Math.PI * 2));
  // Same tile treatment as the base: the unwrap maps a whole turn to u 0..1
  // because it cannot know how big the ring is in metres, so the caller says.
  const linerR = R_IN - 0.005;
  const linerGeo = remapUV(
    projectUV(
      await extrudeProfile(circle(linerR), {
        depth: 2 * COURSE_H,
        axis: 'y',
        holes: [circle(R_IN - 0.045)],
      }),
      { projection: 'cylindrical' },
    ),
    { scale: [(2 * Math.PI * linerR) / 0.58, (2 * COURSE_H) / 0.58], offset: [0, 0] },
  );
  createPart('Shaft', linerGeo, stone, { position: [0, 0, 0], parent: root });

  // Water, and the reason it is here is not decoration. The base disc runs the
  // full radius, so without it you look down the shaft at the base's top face --
  // a cap whose UVs the tile remap above stretched into radial streaks. A well
  // that reads as a well has something dark at the bottom anyway.
  createPart('Water', cylinderGeo(R_IN - 0.05, R_IN - 0.05, 0.02, 32), gameMaterial(0x101a1e, {
    roughness: 0.12,
    metalness: 0.2,
  }), { position: [0, 0.11, 0], parent: root });

  // Base course, slightly proud, so the curb reads as sitting on something.
  const baseR = R_OUT + 0.05;
  // cylinderGeo ships its own UVs, so no unwrap runs and the brick texture gets
  // one full tile stretched around 5.8 m of circumference and squeezed into
  // 100 mm of height -- which is why it read as wood grain. remapUV rescales
  // the existing UVs to a real-world tile: ten repeats around, and a v range
  // matching the course height it actually is.
  const base = createPart(
    'Base',
    remapUV(cylinderGeo(baseR, baseR, 0.10, 24), { scale: [(2 * Math.PI * baseR) / 0.58, 0.1] }),
    stone,
    { position: [0, 0.05, 0], parent: root },
  );

  // Posts and crossbeam. Each post drops through its socket and bears on the
  // plinth, so the load path is timber to stone to ground rather than timber
  // balanced on a curved ledge.
  for (const sz of [-1, 1]) {
    createPart(`Post_${sz > 0 ? 'R' : 'L'}`, boxGeo(POST_W, POST_TOP - BASE_TOP, POST_W), wood, {
      position: [0, (BASE_TOP + POST_TOP) / 2, sz * POST],
      parent: root,
    });
  }
  createPart('Beam', boxGeo(0.134, 0.13, 2 * POST + 0.13), wood, {
    position: [0, 1.82, 0],
    parent: root,
  });

  // Windlass drum and crank — the metal that flat shading cannot show. The drum
  // is long enough to seat INTO both posts; short of that the connectivity gate
  // correctly reports it as floating.
  const drum = createPart('Windlass', cylinderXGeo(0.09, 0.09, 2 * POST - 0.06, 16), iron, {
    position: [0, 1.60, 0],
    parent: root,
  });
  drum.rotation.y = Math.PI / 2;
  createPart('CrankArm', boxGeo(0.05, 0.26, 0.05), iron, {
    position: [0, 1.47, POST + 0.14],
    parent: root,
  });
  createPart('CrankHandle', cylinderXGeo(0.035, 0.035, 0.20, 12), iron, {
    position: [0, 1.34, POST + 0.22],
    parent: root,
  });

  // Roof.
  for (const sz of [-1, 1]) {
    const panel = createPart(`Roof_${sz > 0 ? 'R' : 'L'}`, boxGeo(1.05, 0.05, 0.86), wood, {
      position: [0, 2.02, sz * 0.40],
      parent: root,
    });
    panel.rotation.x = sz * 0.42;
  }

  return root;
}
