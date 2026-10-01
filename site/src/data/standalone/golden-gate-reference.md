# Golden Gate Bridge — modeling reference ledger

Research dates: 2026-09-28–29. Asset coordinates: metres, water Y=0, roadway along Z, south -Z, west +X. All geometry and material maps are authored procedurally in Kiln. Reference photographs are measurement/appearance aids only and are excluded from CC0 delivery. This ledger preserves the estimates written before modeling; subsequent correction sections explicitly supersede them. The final reconciliation below is authoritative for the delivered source.

## Primary sources

- **D1:** Golden Gate Bridge District, [Design & Construction Stats](https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/).
- **D2:** District, [historic resources / finding of effect](https://www.goldengate.org/assets/1/6/suicide-deterrent-finding-of-effect.pdf). Existing bridge dimensions only; net proposals excluded.
- **H:** Library of Congress, HAER CA-31; catalog/drawing availability and measurement limitations recorded in the research notes when resolved.
- **P1:** [Guillaume Paumier tower photograph, 2010](https://commons.wikimedia.org/wiki/File:Tower_and_cables_of_the_Golden_Gate_bridge_in_San_Francisco_64.jpg). Reference only, not copied into textures or delivery. Visible four above-roadway portal struts, recessed vertical panels, stepped underside corbels, fluted legs, paired suspender attachments and curved twin lamp arms.

## Published dimensions adopted

Exact international foot conversion: 1 ft = 0.3048 m; 1 in = 0.0254 m. Metres below use the published imperial value rather than rounded metric captions.

| Quantity | Published | Model metres | Source |
|---|---:|---:|---|
| Suspension structure | 6,450 ft | 1,965.96 | D1 |
| Main span | 4,200 ft | 1,280.16 | D1 |
| Each side span | 1,125 ft | 342.90 | D1 |
| Tower stations | derived | Z = ±640.08 | D1 |
| Suspension ends | derived | Z = ±982.98 | D1 |
| Tower height above water | 746 ft | 227.3808 | D1 |
| Tower height above roadway | 500 ft | 152.40 | D1 |
| Tower roadway elevation | derived 246 ft | 74.9808 | D1, subtraction |
| Midspan soffit clearance | 220 ft | 67.056 | D1 |
| Bridge width / nominal cable-plane spacing | 90 ft | 27.432 | D1; cable spacing interpreted from brief |
| Road between curbs | 62 ft | 18.8976 | D1 |
| Sidewalk, each | 10 ft | 3.048 | D1 |
| Tower leg base | 33 × 54 ft | 10.0584 × 16.4592 | D1 |
| Main cable diameter | 36-3/8 in | .923925 | D1 |
| Suspender diameter | 2-11/16 in | .0682625 | D1 |
| Suspender / cable-band pitch | 50 ft | 15.24 | D1 |
| Suspender quantity | 250 pairs | 500 ropes | D1 |
| Truss depth | 25 ft | 7.62 | task reference; pending primary corroboration |
| Truss vertical pitch | 25 ft | 7.62 | D2 p.2 |
| Outer railing post pitch | 12.5 ft | 3.81 | D2 p.2 |
| Lamp standard pitch, each side | 150 ft | 45.72 | D2 p.2 |
| Historical outer railing height | 4 ft | 1.2192 | District historic resources study, detail research |
| Movable median width × height | 12 × 32 in | .3048 × .8128 | District movable median information, detail research |

## Estimates and artistic construction parameters (declared before modeling)

The following are modeling estimates, not surveyed dimensions. They preserve measured principal spans and massing. Supplemental research may refine them through retained revisions.

- Cable saddle center Y=224.5; 470 ft / 143.256 m sag from contemporary design report, rather than the brief's tentative 475 ft. Midspan cable center =81.244. Main cable is an exact sampled parabola between saddle transition zones. Side spans descend to Y=64 at Z=±982.98, with a gentle quadratic sag; cable continues into anchorage housing at ±1011.98. Saddle rounding is a local smooth crest over ±6 m.
- Road deck initially Y=74.9808, refined to center top Y=75.30, bottom at Y=67.056 including the 7.62 m truss and .624 m upper deck zone. Side-span roadway slopes to Y=62.0 at suspension ends; finished stub ends Z=±1032.98, 50 m beyond suspended span. Median is centered, six lane widths derived from usable carriageway.
- Tower leg center transverse offset from ±17.5 at pier to ±13.716 at crown. Steel begins Y=12.0. Estimated setbacks at Y=74.98, 110, 146, 183, 220; widths 10.0584, 7.2, 6.25, 5.35, 4.5, 3.6 m; depths 16.4592, 12.8, 10.8, 8.8, 6.8, 5.0 m. Crown cap finishes published tower height. Four portal centers Y=108, 144, 180, 216; 8 m deep vertically, with stepped corbels and faceted vertical recessed panelling. Portal count from P1 and brief.
- Leg flutes recessed about .16–.28 m, long face seams every 4–7 m, chamfers .05–.14 m. Structural plate skin, inset panels, rivet head diameter .07–.12 m at representative panel boundaries; no claim to individual historic rivet layout.
- Pier approximate 45 × 24 m at base, crown Y=12. South fender ellipse 91.44 m in X by 47.244 m in Z, wall 3.048 m, top 4.572 m, bottom -.6 m: contemporary 1935 design figures, source research to follow. North pier ground termination as requested, without terrain.
- Anchorages: two cable housings per end, approximately 11 m wide × 30 m long, rising to 66 m, terraced concrete; flanking pylons rise to 83 m, stepped cap and vertical grooves. Bases begin Y=-.6. Stub has clean planar road end. These omit the approach viaducts and underlying terrain.
- Truss chord section .50 × .62 m, diagonal .27 × .34 m, posts .28 × .36 m; paired plate/flange geometry, gusset plates and representative rivets. Underdeck lateral bracing section .16 × .22 m every 15.24 m. Intentional member contact at panel nodes.
- Cable-band length .72 m, shell radius .54 m, flanges and clamp bolts; paired rope centers separated .34 m transversely; deck clevis at each station. Saddle base 3.8 × 6 m, approximately 2 m high, tapering weather cover, aircraft beacon .22 m radius. Wrap seam pitch .26 m only in local crown hero region if cost permits.
- Sidewalk slab thickness .28 m, curb lip .20 m. Rail top .09 × .09 m, posts .085 m, infill .028 m at .635 m. Lamps 8.5 m above sidewalk, tapered/fluted post, inward curved double arms reaching 2.3 m, rectangular lantern 1.3 × .38 × .52 m; shape follows P1, dimensions estimated. Median unit length 1 m with narrow articulation seams.
- Painted steel initial sRGB #C0362C, dielectric metalness=0, roughness=.36; secondary recessed paint #AB3026, roughness=.44. Concrete warm grey #BDB6A7 roughness=.88; asphalt #343639 roughness=.96; marking ivory #E8E5D9 roughness=.72; warm lamp glass, red warning lenses. All material/noise choices are artistic estimates tuned only in GPU views. Procedural noise seeds and texture resolutions are implementation choices, not reference facts.
- Geometry sampling and optimizations are implementation parameters. Dimensions of fillets, fasteners, drains, expansion joints, access door recesses, light lenses and minor trim are artistic estimates where not explicitly published above.

## Scope and historical reconciliation

### Final source additions and reconciliation

- **D5:** [District underwater-inspection presentation, PDF p.5 / printed p.15](https://www.goldengate.org/assets/1/6/2025-0821-bocomm-no5-underwaterinspectionvideoembed-final.pdf?13065=) identifies both visible piers as 140×66 ft = 42.672×20.1168 m. The model uses those body dimensions, top Y 13.4112, a 46×23.6 m flared footing (estimate), and the original 91.44×47.244 m south fender. Its section drawings confirm a broad open moat. The older 5 ft gap is not applied to this waterline geometry.
- **H catalog:** [HAER CA-31](https://www.loc.gov/item/ca1355/) and its JSON resource list provide 47 photographs, a history and photo captions, with no digitized drawing sheets. [HAER saddle photograph CA-31-31](https://tile.loc.gov/storage-services/service/pnp/habshaer/ca/ca1300/ca1355/photos/016353pv.jpg) informs 15 gusset fins on each side of the modeled saddle and its tapered beacon plinth; fin count/dimensions are visual approximations. [HAER anchorage photograph](https://tile.loc.gov/storage-services/service/pnp/habshaer/ca/ca1300/ca1355/photos/016328pv.jpg) informs the simplified end masses.
- **S:** [USNI Proceedings, April 1935, Golden Gate and San Francisco Bay Bridges](https://www.usni.org/magazines/proceedings/1935/april/golden-gate-and-san-francisco-bay-bridges) gives 470 ft sag and the 300×155 ft fender, explicitly crediting District data. These are contemporary design figures, not independent as-built surveys.
- [District movable median design](https://www.goldengate.org/bridge/bridge-operations/moveable-median-barrier/) supplies 12 in × 32 in units. Unit length 2 m and 22 mm visual articulation joints in this asset remain estimates.
- Final color tuning: original Kiln noise albedo paint #962B20–#A83124, recess #7C2119; warm concrete #625D53–#736D60; asphalt #07090A–#131619. These are artistic factors chosen against photos in the fixed material-faithful GPU lighting, not a claim to official paint reflectance. Paint roughness .48; all painted surfaces metalness 0. Four 256² procedural maps total: paint, concrete, asphalt, asphalt normal. No acquired imagery.
- Camera near-plane choices (.5–5 m) are presentation settings for stable depth precision in kilometre-scale geometry, not alterations to the mesh.
- Final geometry uses 660 longitudinal main-cable segments with a 12-sided smooth cross section and closed endpoint caps; 5-sided smooth suspender ropes; 10-sided cable bands. Small rivets/bolt heads use octahedral approximations. Static arrays batch repeated primitive geometry by material; no GPU instancing extension or compressed geometry is assumed.

### Pre-modeling correction from the District tower elevation

Deck-stage estimates: movable median modeled as articulated 2 m units with 22 mm joints (unit length unverified; width/height published). Outer railing uses four equal subdivisions of the 3.81 m principal-post bay, approximately .9525 m infill spacing; estimated intentionally open rail. At the main towers sidewalks flare 8.6 m outward over a 26 m half-length to bypass the leg solids, a visual routing approximation. Anchorage concrete is a 43×52 m base, 39×49.5 m main body, roof at 61.4 m, and pylon crowns 70.65 m. These supersede the preliminary 83 m pylons and smaller cable-housing estimate; Y0 ground termination is a requested abstraction of the terrain-supported real anchorages.

**D3:** [District seismic presentation, 26 June 2025, PDF p.5](https://www.goldengate.org/assets/1/25/2025-0626-bocomm-no8-seismicpresentation.pdf), existing tower elevation (proposed retrofit details excluded). This supersedes the preliminary tower estimates above: leg centerlines remain fixed at X=±13.716; only each leg's local envelope steps inward. Four portal center elevations are 376.9, 506.9, 616.9, 716.1 ft = 114.87912, 154.50312, 188.03112, 218.26728 m. Their vertical depths are 30, 30.1, 21.8, 21.9 ft = 9.144, 9.17448, 6.64464, 6.67512 m. Two X-bracing bays are below deck, between approximate Y=13.411, 35.8 and 67.7. Drawing steel cap 734.3 ft = 223.81464 m; beacon tip 758.2 ft = 231.09936 m. Drawing datum is not explicitly identified on this slide, so alignment with model water is an assumption; cable saddle center chosen Y=227.3808 (published nominal tower height), steel cap 223.81464 and beacon tip 231.10. Principal tower datum remains within published dimensions; report projections separately.

Estimated tower tier boundaries adopted: 13.4112, 72, 121, 161, 191, 223.81464 m. Tier widths X: 10.0584, 7.4, 6.5, 5.4, 4.5 m; Z depths: 16.4592, 11.4, 9.7, 8.0, 7.0 m. Top saddle cover tapers separately to approx 3.7×6.1 m. Actual tier steps and flutes are photo-based estimates. Main cable midspan center becomes 84.1248 m using 143.256 m sag. Fender orientation confirmed: 91.44 X × 47.244 Z.

**D4:** [District Art Deco exhibit](https://www.goldengate.org/exhibits/art-deco-on-a-grand-scale/) supplies appearance photos of twin curved lamp arms and chevron-faced stepped concrete pylons. These are viewed for form; no pixels enter the authored maps. Pylon detail estimate updated to repeated triangular vertical ribs, not simple rectangular groove faces.

1937 suspension composition with present paint, lamps, movable median and requested lateral bracing; the District dates added lower lateral bracing to 1953–54. This is therefore a deliberate hybrid requested by the brief. No terrain, water, traffic, people, approach viaduct, net or maintenance apparatus. Fort Point arch deferred until primary scope passes review. This is a visual reconstruction, not an engineering survey.

## Final reconciliation — source p_5bfd30103aaf

This section records the pre-Review 1 delivery. The Review 1 ledger at the end supersedes affected finishes and detail estimates.

The published dimensional table and corrected District tower geometry govern the final source. These final values supersede the preliminary estimates retained above:

| Parameter | Delivered value / basis |
|---|---|
| Cable curve | Nominal saddle Y = 227.3808 m, sag = 143.256 m, center Y = 84.1248 m; local Hermite rounding over 5 m each side of the saddle; end centers at Z = ±1012.98 m, Y ≈ 51.9894 m inside housings |
| Road and truss clearance | Road Y = 75.30 m at center, 74.9808 m at towers, 62 m at span ends; lowest nominal midspan truss surface ≈ 67.05 m, within 0.01% of 67.056 m |
| Tower envelope | Steel crown cap Y = 223.81464 m; beacon maximum Y = 230.76464 m; nominal published tower height retained as cable saddle datum, with projections reported separately |
| Tower tiers | Boundaries 13.4112, 72, 121, 161, 191, 223.81464 m; estimated nominal widths 10.0584, 7.4, 6.5, 5.4, 4.5 m and depths 16.4592, 11.4, 9.7, 8, 7 m. Flutes project slightly beyond the nominal envelope |
| Below-road bracing | Two X bays use final estimated node elevations 14, 39.2 and 69 m; representative beam sections, not a structural calculation |
| Piers and fender | Pier body 42.672 × 20.1168 m, crown Y = 13.4112 m. Footing estimate 46 × 23.6 m. South fender 91.44 × 47.244 m, wall 3.048 m, top Y = 4.572 m, lower skirt Y = −0.6 m |
| Median | Width 0.3048 m and height 0.8128 m verified against District [Key Dates](https://www.goldengate.org/bridge/history-research/moments-events/key-dates/), September 2013 and January 2015 entries. Simplified rectangular units are 2 m long with 0.022 m joints; length and profile are modeling approximations |
| Rail infill | Approximately 0.9525 m pitch within published 3.81 m main-post bays; aesthetic estimate |
| Sidewalk bypass | 8.6 m maximum outward shift, blending within 26 m of tower station; estimated geometry, not measured accessibility clearance |
| End structures | 43 × 52 m base, 39 × 49.5 m housing body, roof Y = 61.4 m, pylon tips Y = 70.65 m; estimated forms. Base at water datum is the brief's standalone abstraction |
| Final paint | Original noise albedo #6A1D12–#7A2417, roughness 0.60, metalness 0; inset paint #7C2119, roughness 0.52. Tuned by GPU appearance under Kiln's fixed lighting; these factors are not official paint reflectance measurements |
| Final concrete | Original low-contrast noise #69645A–#6C675D, roughness 0.90; noise scale 11, 4 octaves, seed 1933, fine modulation opacity 0.06. Replaces the visibly repetitive higher-contrast finish |
| Other materials | Asphalt #07090A–#131619, roughness 0.97 with a subtle generated normal; ivory markings; amber lamp lenses and red warning lenses. Four original 256 × 256 texture maps total |

All secondary section sizes, bevels, panels, bolt approximations, lamp construction, pylon decoration, sampling counts, noise seeds and camera values in the supplied source/camera JSON are declared artistic or implementation estimates unless specifically linked to a published measurement above. The truss depth remains the supplied 25 ft brief value; the separate 25 ft panel pitch is primary-source corroborated. No inference that the two measurements are the same was used as verification.

## Review 1 refinement ledger — recorded before edits

The coordinator's Review 1 is the design authority for these corrections. Principal span, cable and tower dimensions remain locked to the published ledger. All new minor dimensions below are visual construction estimates, not newly surveyed historic facts.

- Main paint base factor: exact sRGB #C0362C, metalness 0, roughness 0.68; recessed paint roughness 0.74. Original neutral modulation textures add restrained value variation without a second orange tint. Plate variation, rivet streaking and recessed dirt are procedural; map sizes at most 1024² under the 2048² brief limit.
- Tower plate cadence: approximately 6 m vertical rows on all four leg faces, with horizontal joint lines and representative rivet heads. Existing tier heights and envelope remain unchanged. Seam widths, rivet sizes and weathering lengths are artistic estimates.
- Tower sidewalk bypass: retain the 8.6 m outward displacement and 26 m blend zones, replace the local 3.048 m-wide concrete bypass with painted steel, preserve walking height and continuous railings, add a shallow painted edge fascia connected to the existing cantilever knees.
- Outer railing infill repair and optimization: retain post spacing and silhouettes; infill height 1.1392 m, center at roadway +0.87 m, so it reaches both horizontal rails. Square profiles omit only end faces buried in connected rails/slabs; side walls remain visible geometry.
- Crown refinement: continue the upper leg's stepped, recessed Art Deco envelope, replace exposed picket fins and pyramidal covers with explicit rounded cable housings, preserve nominal cable saddle Y=227.3808 m and aircraft beacon tip Y=230.76464 m. Detailed dimensions will be recorded with the accepted revision.
- Underdeck: narrow/recess the soffit around the 18.8976 m carriageway and expose structural floor beams and longitudinal stringers. Member sections and cadence are estimates selected to join the existing truss and lateral frames without changing clearance.
- Median: retain published 0.3048 m width and 0.8128 m height, use approximately 1 m short segments with millimetre-scale joints, and conform each end to the actual road curve. This replaces ungraded 2 m boxes; hinge/profile geometry remains an approximation.
- Postcard camera: estimated Battery Spencer composition, on +X/+Z (Marin north-west), approximately Y=120 m, looking south-east along the span. Terrain is excluded. Camera position is a composition choice, not a survey location.
- Crown implementation estimates: rounded tunnel housing 2.8 m wide × 9 m long, floor 0.32 m above steel crown; roof 0.86 m above the local cable center; nominal tunnel horizontal radius 0.53 m with slope-adjusted vertical radius and a small 0.450 m bottom bearing land. Three beacon-plinth steps occupy local Y=4.12–6.26 m. All four retained beacon tips stay at Y=230.76464 m. Explicit 16×16 section grid; source topology verified as a closed tunnel, not a fabrication survey.
- Underdeck implementation estimates: plate X±9.4488 m, top road−0.43 m, thickness 0.10 m. Five T-stringers at X=−6.3,−3.15,0,3.15,6.3 m; web 0.14×0.64 m, bottom flange 0.46×0.10 m. At suspender stations, floor I-beams span 27.432 m, web 1.20 m deep×0.12 m, flange 0.44×0.10 m, center about road−1.80 m. Ordinary sidewalk stools 0.36×1.11×0.34 m; ends embed into supporting surfaces. These are visual member estimates, not verified load-bearing specifications.
- Final median segmentation uses 2,066 approximately 1 m units, 4 mm joints and exact road samples at the tower/span grade breaks, preserving constant 0.8128 m vertical height. Inner guard posts are 0.88 m tall with their ends seated inside slab/upper rail. Narrow chord/stringer sampling at 32 intervals preserves the shallow crown to approximately submillimetre accuracy between forced grade-break samples.
