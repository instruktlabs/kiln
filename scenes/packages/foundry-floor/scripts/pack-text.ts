// SPDX-License-Identifier: MIT
// The pack wording of the package data's documentation strings (FF3 pack hygiene): the ff3 pack ships no repository
// paths or working names, so every documentation string of a staged data file that cites a repository file, an author
// workspace, a brief or a coordination log is replaced, whole and exactly, by the entry below; everything else in the
// file (every number, id, name, key and structure) is staged unchanged. Keyed by the pack path, then by the exact
// package string. Curated by hand: a data change that adds or edits such a string fails the ff3 pack test (a stale
// entry, or a hygiene hit on the staged pack) until its pack wording is written here. The scene reads none of these
// strings. Used by scripts/pack-hygiene.ts.
export const PACK_TEXT: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "data/assets.json": {
    "scripts/inspect-assets.ts: the scene rules are curated in the script from the coordinator reviews; measured, locators, clips and nodes are read from the pinned GLBs":
      "the Foundry Floor asset inspection: the scene rules are curated from the coordinator reviews; measured, locators, clips and nodes are read from the pinned GLBs",
    "GLB paths are relative to the scene pack root; staging (scripts/stage.ts) copies each accepted GLB to models/ and checks its bytes and SHA-256 against the pins; the scene loads them through the kit's pack loader":
      "GLB paths are relative to the scene pack root; staging copies each accepted GLB to models/ and checks its bytes and SHA-256 against the pins; the scene loads them through the kit's pack loader",
    "Authored asset content only, designated CC0-1.0 by the project owner to the extent of the owner's rights: the Farm pack's licence and scope (DECISIONS D-35). The author workspaces and revision manifests carry no licence file; staging writes licenses/ASSET-LICENSE.txt":
      "Authored asset content only, designated CC0-1.0 by the project owner to the extent of the owner's rights: the Farm pack's licence and scope (owner decision, 2026-09-30). The Kiln revisions carry no licence file; staging writes licenses/ASSET-LICENSE.txt",
    "the pack palette (briefs/assets.json)":
      "the pack palette (the asset briefs)",
    "D-42 (owner, 2026-09-30): one kit per section module, root on the subfab floor (Y -7.5) at module-frame X 0.63, Z 0, yaw 90 (the 23:32 rule: the 3.6 m side along Z, the pipes ending at the waffle slab underside), inside the kit zone the layout enlarges from the module's own (X -0.5..1.2, Y -7.5..-5.5, Z -1.8..1.8, coordinator 00:33) to take the kit as built. X 0.63 is the least whole centimetre east of the mount (0.35) at which the kit clears every drawn module part by 0.10 m at micrometre resolution; the module's subfab is shallower than the kit, so it reaches 0.63 m past the section plane (layout.sectionCut.kitZone; evidence/sim-spec/ff3/kit-clearance.json)":
      "D-42 (owner, 2026-09-30): one kit per section module, root on the subfab floor (Y -7.5) at module-frame X 0.63, Z 0, yaw 90 (the 23:32 rule: the 3.6 m side along Z, the pipes ending at the waffle slab underside), inside the kit zone the layout enlarges from the module's own (X -0.5..1.2, Y -7.5..-5.5, Z -1.8..1.8, coordinator 00:33) to take the kit as built. X 0.63 is the least whole centimetre east of the mount (0.35) at which the kit clears every drawn module part by 0.10 m at micrometre resolution; the module's subfab is shallower than the kit, so it reaches 0.63 m past the section plane (layout.sectionCut.kitZone; evidence/kit-clearance.json)",
    "people: the qualification visits of the twin (sim/service.ts, the stub provider); the scene walks a technician in from the fab door, idles beside the qualifying tool and walks out (scene/people.ts). FF3 gives the repair and PM visits to the humanoid work robot, a second class behind the same people interface (sim-config movers `visits`)":
      "people: the qualification visits of the twin (its service interface, the stub provider); the scene walks a technician in from the fab door, idles beside the qualifying tool and walks out. FF3 gives the repair and PM visits to the humanoid work robot, a second class behind the same people interface (sim-config movers `visits`)",
    "people (FF3): the repair and PM visits of the twin (sim/service.ts, the stub provider); the scene walks the robot in from the fab door along the aisle path, services the tool and walks it out (scene/people.ts), the technician keeping the qualifications (sim-config movers `visits`). Carry and Handoff are not played: the twin moves every FOUP by the overhead rail, so no floor move has a source":
      "people (FF3): the repair and PM visits of the twin (its service interface, the stub provider); the scene walks the robot in from the fab door along the aisle path, services the tool and walks it out, the technician keeping the qualifications (sim-config movers `visits`). Carry and Handoff are not played: the twin moves every FOUP by the overhead rail, so no floor move has a source",
    "only where the spine's east U-turn sweeps a vehicle through the shaft (layout.sectionCut.modulePlacements[].variant, chosen by build-layout.ts); every other module keeps its shaft":
      "only where the spine's east U-turn sweeps a vehicle through the shaft (layout.sectionCut.modulePlacements[].variant, chosen when the layout is built); every other module keeps its shaft",
  },
  "data/campus.json": {
    "scripts/build-campus.ts (from the structures contract, the accepted blueprint v7 and the verified structure exports; lanes, markings, parking, satellites, lights, tiers, views and looks are estimates (E) within them)":
      "the Foundry Floor campus build (from the structures contract, the accepted blueprint v7 and the verified structure exports; lanes, markings, parking, satellites, lights, tiers, views and looks are estimates (E) within them)",
    "pack2-research/terafab/briefs/structures-contract.md":
      "the campus structures contract",
    "pack2-research/terafab/campus-blueprint-v7.svg":
      "the accepted campus blueprint, v7",
    "the lit parapet strip: S1 (accepted 15:00) inlays it in the top 0.3 m of the parapet's outer face; S2 (review 2) puts it on top of the parapet, 0.3 wide and 0.1 tall (the rule settled at the head's second round); the coordinator's seam check (OVERNIGHT.md 16:05) kept S1 accepted, no head round 3":
      "the lit parapet strip: S1 (accepted 15:00) inlays it in the top 0.3 m of the parapet's outer face; S2 (review 2) puts it on top of the parapet, 0.3 wide and 0.1 tall (the rule settled at the head's second round); the coordinator's seam check (16:05) kept S1 accepted, no head round 3",
    "s1-head-half.md: entrancePortal frame 2 m deep around the opening":
      "the S1 head brief: entrancePortal frame 2 m deep around the opening",
    "s2-hall-half.md: bayFins 0.6 deep on both faces":
      "the S2 hall brief: bayFins 0.6 deep on both faces",
    "TASK-FF-CAMPUS-1 Sources":
      "the FF-C1 brief, Sources",
    "campus-blueprint-v7.svg is in the same directory as the contract (briefs/)":
      "the campus blueprint v7 is filed beside the structures contract",
    "read from pack2-research/terafab/campus-blueprint-v7.svg (the contract header names that path)":
      "read from the place the contract's header names",
    "TASK-FF-CAMPUS-1 items 2 and 9":
      "the FF-C1 brief, items 2 and 9",
    "pack2-research/terafab/briefs/structures-contract.md S3 and pack2-research/terafab/campus-blueprint-v7.svg":
      "the structures contract, S3, and the campus blueprint v7",
    "pack2-research/terafab/campus-blueprint-v7.svg and pack2-research/terafab/briefs/structures-contract.md revision 3":
      "the campus blueprint v7 and the structures contract, revision 3",
    "pack2-research/terafab/briefs/structures-contract.md Head (S1)":
      "the structures contract, Head (S1)",
    "s4-arrival-canopy.md dropOffKerb":
      "the S4 arrival canopy brief, dropOffKerb",
    "pack2-research/terafab/briefs/structures-contract.md S3 (review 1)":
      "the structures contract, S3 (review 1)",
    "pack2-research/terafab/briefs/structures-contract.md Seam face and the rules of 15:00":
      "the structures contract, Seam face and the rules of 15:00",
    "the envelope outline and slab bands match within 5 mm otherwise; the coordinator kept S1 accepted at the seam check (OVERNIGHT.md 16:05); listed for the owner":
      "the envelope outline and slab bands match within 5 mm otherwise; the coordinator kept S1 accepted at the seam check (16:05); listed for the owner",
  },
  "data/driving.json": {
    "arcade driving of the sedan on the campus roads (FF-C1 item 5) on the Golden Gate driving model's conventions (packages/golden-gate/data/driving.json): the same start rule, speeds, brakes, coasting, reverse, curb, traffic margins, road-end turn-around and controls; src/campus/drive/car.ts is the model":
      "arcade driving of the sedan on the campus roads (FF-C1 item 5) on the Golden Gate driving model's conventions (its driving data): the same start rule, speeds, brakes, coasting, reverse, curb, traffic margins, road-end turn-around and controls; the scene's car module is the model",
    "the car drives the drivable area of data/campus.json (src/campus/roads.ts drivableArea): the split road to its car ends, the drop-off bays, the roundabout outside its island and kerb, and the cross-pass stubs; at its edge the footprint is held curb.clearance inside, the car bumps (keeps curb.speedKept of its speed, at most once per curb.cooldown seconds) and its heading relaxes along the edge":
      "the car drives the drivable area of data/campus.json (the campus roads' drivableArea): the split road to its car ends, the drop-off bays, the roundabout outside its island and kerb, and the cross-pass stubs; at its edge the footprint is held curb.clearance inside, the car bumps (keeps curb.speedKept of its speed, at most once per curb.cooldown seconds) and its heading relaxes along the edge",
    "traffic on the eight split-road lanes of data/campus.json (four each way, through the roundabout): Golden Gate's free-flowing model (packages/golden-gate/src/traffic/sim.ts) with its seed, class weights, palette, IDM and brake-light values; each lane's cruising speed is its lane speed, held on the fillets and the ring to sqrt(flow.lateralAccel x radius), planned ahead at flow.planDecel; vehicles enter and leave at the lane ends and fade over flow.fade metres there, which must fit inside roads.split.dissolve (the road fading into grade); mean entry headway and the per-lane cap are the tier's (data/campus.json tiers trafficHeadway, trafficPerLane) and levels of detail switch at the tier's trafficLod distances; vehicles[type].lanes are the lane indices (0 next to the centre line .. 3 outer) the type may use":
      "traffic on the eight split-road lanes of data/campus.json (four each way, through the roundabout): Golden Gate's free-flowing traffic model with its seed, class weights, palette, IDM and brake-light values; each lane's cruising speed is its lane speed, held on the fillets and the ring to sqrt(flow.lateralAccel x radius), planned ahead at flow.planDecel; vehicles enter and leave at the lane ends and fade over flow.fade metres there, which must fit inside roads.split.dissolve (the road fading into grade); mean entry headway and the per-lane cap are the tier's (data/campus.json tiers trafficHeadway, trafficPerLane) and levels of detail switch at the tier's trafficLod distances; vehicles[type].lanes are the lane indices (0 next to the centre line .. 3 outer) the type may use",
    "vehicle lamps as Golden Gate's layout.json lights.vehicleLamps: emissive = authored emissive colour x mix(gain[0], gain[1], level); brake lamps further scaled by mix(brakeOff, 1, braking); taillights scaled so their largest channel is at most taillightPeak; lamps.day is the day preset's level":
      "vehicle lamps as Golden Gate's lights.vehicleLamps: emissive = authored emissive colour x mix(gain[0], gain[1], level); brake lamps further scaled by mix(brakeOff, 1, braking); taillights scaled so their largest channel is at most taillightPeak; lamps.day is the day preset's level",
  },
  "data/layout.json": {
    "scripts/build-layout.ts (from the simulation spec sections 2-5 and 10 and the measured assets in data/assets.json)":
      "the Foundry Floor layout build (from the simulation spec sections 2-5 and 10 and the measured assets in data/assets.json)",
    "module frame. The module's own zone (1.7 x 2 x 3.6 m) takes the kit (2.4 m across the cut, 6 m tall at yaw 90) in no quarter turn, and the module's subfab is shallower than the kit, so the enlarged zone crosses the section plane by 0.63 m: the kit stands 0.63 m east of the module centre (0.28 m east of the mount), the least whole centimetre at which it clears every drawn module part by 0.10 m at micrometre resolution (the floor slab and the waffle slab excepted; tests/unit/clearance.test.ts)":
      "module frame. The module's own zone (1.7 x 2 x 3.6 m) takes the kit (2.4 m across the cut, 6 m tall at yaw 90) in no quarter turn, and the module's subfab is shallower than the kit, so the enlarged zone crosses the section plane by 0.63 m: the kit stands 0.63 m east of the module centre (0.28 m east of the mount), the least whole centimetre at which it clears every drawn module part by 0.10 m at micrometre resolution (the floor slab and the waffle slab excepted; evidence/kit-clearance.json)",
  },
  "data/rail-graph.json": {
    "scripts/build-rail-graph.ts from data/layout.json and the rail-kit piece dimensions":
      "the Foundry Floor rail-graph build, from data/layout.json and the rail-kit piece dimensions",
  },
  "data/route.json": {
    "scripts/build-layout.ts":
      "the Foundry Floor layout build",
  },
  "data/sim-config.json": {
    "owner decision 2026-09-29: the release rate is raised until the busiest families (etch, CVD/ALD) run at about 85 percent of calendar time; 180 lots of 25 wafers, one every 4 h. Tool counts, MTBF/MTTR and PM are as specified. The sweep is in evidence/sim/retunes.json":
      "owner decision 2026-09-29: the release rate is raised until the busiest families (etch, CVD/ALD) run at about 85 percent of calendar time; 180 lots of 25 wafers, one every 4 h. Tool counts, MTBF/MTTR and PM are as specified. The sweep is recorded outside the pack; its runs next to the adopted rate are in evidence/sanity.json (bandFrom)",
    "a stub: the twin simulates no technician travel; repairs start at the failure (sim-spec 3.8 lets the repair clock run during the walk). Repair and PM visits go through one interface (src/sim/service.ts, ServiceProvider); the scene draws a walker for each visit without changing the tool timeline: FF3's humanoid work robot (movers class humanoid) for the repair and PM visits, a technician (class technician) for the qualifications":
      "a stub: the twin simulates no technician travel; repairs start at the failure (sim-spec 3.8 lets the repair clock run during the walk). Repair and PM visits go through one interface (the twin's ServiceProvider); the scene draws a walker for each visit without changing the tool timeline: FF3's humanoid work robot (movers class humanoid) for the repair and PM visits, a technician (class technician) for the qualifications",
    "accepted and staged (r_9f717d17eec74f2dbd4c338612207ed5). FF3: takes the repair and PM visits through the technician's people path (src/scene/people.ts): walks in through layout.people.door along the target's aisle path at walkSpeedMps, services the tool (Service), walks out when the tool's state moves on; the qualification after a PM goes to the technician. Walk plays at speed / walkDesignSpeedMps. Carry and Handoff stay unplayed (clips play floor-move): the twin moves every FOUP by the overhead rail, so there is no hand-carry source (FF3 decision 1)":
      "accepted and staged (r_9f717d17eec74f2dbd4c338612207ed5). FF3: takes the repair and PM visits through the technician's people path: walks in through layout.people.door along the target's aisle path at walkSpeedMps, services the tool (Service), walks out when the tool's state moves on; the qualification after a PM goes to the technician. Walk plays at speed / walkDesignSpeedMps. Carry and Handoff stay unplayed (clips play floor-move): the twin moves every FOUP by the overhead rail, so there is no hand-carry source",
    "every tool scheduled, the spec's repair times; the release rate is the owner's 4,500 starts a month. FF1's two retunes (tools NON_SCHEDULED, MTTR x2) were not adopted and stay in evidence/sim/retunes.json with the release sweep; these two knobs let a run repeat them":
      "every tool scheduled, the spec's repair times; the release rate is the owner's 4,500 starts a month. FF1's two retunes (tools NON_SCHEDULED, MTTR x2) were not adopted and are recorded with the release sweep outside the pack; these two knobs let a run repeat them",
  },
  "data/tools.json": {
    "scripts/build-layout.ts":
      "the Foundry Floor layout build",
  },
  "evidence/sanity.json": {
    "every tool scheduled, the spec's repair times; the release rate is the owner's 4,500 starts a month. FF1's two retunes (tools NON_SCHEDULED, MTTR x2) were not adopted and stay in evidence/sim/retunes.json with the release sweep; these two knobs let a run repeat them":
      "every tool scheduled, the spec's repair times; the release rate is the owner's 4,500 starts a month. FF1's two retunes (tools NON_SCHEDULED, MTTR x2) were not adopted and are recorded with the release sweep outside the pack; these two knobs let a run repeat them",
    "the release sweep (retunes.json, releaseSweep.runs)":
      "the twin's release sweep: its runs at the next lower and the next higher release rate (lower, upper)",
  },
};
