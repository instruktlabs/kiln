// Generated from the approved owner layout. Consumer placement data, not engine defaults.
export const CABIN_PLAN={
  "version": "nightman.cabin-layout.v2-approved",
  "date": "2026-10-12",
  "status": "Owner approved drawn layout; cabin rebuild in progress",
  "footprint": {
    "width": 12,
    "depth": 10,
    "nominalArea": 120,
    "exteriorWallThickness": 0.2,
    "ceilingHeight": 2.8,
    "grid": 2
  },
  "baseline": {
    "worldX": 6,
    "worldZ": 8,
    "nominalArea": 48,
    "source": "Current saved cabin floor and review-scene CABIN bounds"
  },
  "coordinateFrame": {
    "plan": "u right across frontage; v down from rear to front; metres",
    "world": "[X,Y,Z]=[v-5,Y,u-6]; +X front, +Y up, +Z right"
  },
  "rooms": [
    {
      "id": "living",
      "name": "Open living / dining",
      "u": 0,
      "v": 0,
      "w": 8,
      "d": 10,
      "note": "No living-room partition. Direct views across hearth, table, TV and entry."
    },
    {
      "id": "bedroom",
      "name": "Bedroom",
      "u": 8,
      "v": 0,
      "w": 4,
      "d": 4,
      "clear": "3.7 × 3.7 m"
    },
    {
      "id": "supply",
      "name": "Tools / supplies",
      "u": 8,
      "v": 4,
      "w": 4,
      "d": 3,
      "clear": "3.7 × 2.8 m"
    },
    {
      "id": "kitchen",
      "name": "Open kitchen nook",
      "u": 8,
      "v": 7,
      "w": 4,
      "d": 3,
      "note": "Open edge to living area; no door or full partition."
    }
  ],
  "doors": [
    {
      "id": "D1",
      "name": "Front entry",
      "u": 5.5,
      "v": 10,
      "w": 1.1,
      "axis": "u",
      "hinge": "left",
      "note": "Clear opening1.1m;2.2m height; inward swing away from the main walking lane."
    },
    {
      "id": "D2",
      "name": "Bedroom door",
      "u": 8,
      "v": 2.5,
      "w": 1,
      "axis": "v",
      "note": "Clear opening1m; swing into bedroom."
    },
    {
      "id": "D3",
      "name": "Supply-room door",
      "u": 8,
      "v": 5.35,
      "w": 1,
      "axis": "v",
      "note": "Clear opening1m; swing into supply room."
    },
    {
      "id": "D4",
      "name": "Work-yard exit",
      "u": 12,
      "v": 5.1,
      "w": 1.1,
      "axis": "v",
      "note": "Clear opening1.1m; outward swing with a clear landing."
    }
  ],
  "windows": [
    {
      "id": "W1",
      "u": 2.2,
      "v": 0,
      "w": 1.2,
      "axis": "u",
      "room": "living"
    },
    {
      "id": "W2",
      "u": 9.3,
      "v": 0,
      "w": 1.2,
      "axis": "u",
      "room": "bedroom"
    },
    {
      "id": "W3",
      "u": 12,
      "v": 1.6,
      "w": 1.2,
      "axis": "v",
      "room": "bedroom"
    },
    {
      "id": "W4",
      "u": 0,
      "v": 1.8,
      "w": 1.2,
      "axis": "v",
      "room": "living"
    },
    {
      "id": "W5",
      "u": 0,
      "v": 7.5,
      "w": 1.2,
      "axis": "v",
      "room": "living"
    },
    {
      "id": "W6",
      "u": 2.2,
      "v": 10,
      "w": 1.2,
      "axis": "u",
      "room": "living"
    },
    {
      "id": "W7",
      "u": 9.3,
      "v": 10,
      "w": 1.2,
      "axis": "u",
      "room": "kitchen"
    }
  ],
  "items": [
    {
      "id": "H1",
      "name": "Stone hearth",
      "u": 0.25,
      "v": 4.15,
      "w": 0.84,
      "d": 1.34,
      "kind": "authored",
      "room": "living",
      "note": "Existing authored footprint, rotated to face into the room. Reserve1.1m in front for feeding and tool clearance; ash/poker dress this area."
    },
    {
      "id": "B1",
      "name": "Hearth bench",
      "u": 2.25,
      "v": 4.25,
      "w": 0.42,
      "d": 1.1,
      "kind": "authored",
      "room": "living",
      "note": "Faces the hearth; benches remain movable dressing and do not choke the route."
    },
    {
      "id": "B2",
      "name": "TV bench",
      "u": 1.8,
      "v": 7.4,
      "w": 1.1,
      "d": 0.42,
      "kind": "authored",
      "room": "living",
      "note": "Second instance of the bench; faces the TV corner."
    },
    {
      "id": "T1",
      "name": "CRT + supporting table",
      "u": 0.5,
      "v": 8.9,
      "w": 1.1,
      "d": 0.65,
      "kind": "authored",
      "room": "living",
      "note": "TV .50×.44m sits on the authored table .78m high. Clock/picture can dress this corner. Keep W5 andW6 approach clear."
    },
    {
      "id": "T2",
      "name": "Dining table",
      "u": 4.6,
      "v": 7.1,
      "w": 1.4,
      "d": 0.8,
      "kind": "planned",
      "room": "living",
      "note": "Target from the asset bible, larger than the current1.1×.65m table. Radio, mugs, food tins and books sit here; no table in the central door route."
    },
    {
      "id": "C1",
      "name": "Dining chair",
      "u": 4.7,
      "v": 6.35,
      "w": 0.45,
      "d": 0.5,
      "kind": "planned",
      "room": "living",
      "note": "Four chairs around the proposed table; final collision and pullback space still need scene review."
    },
    {
      "id": "C2",
      "name": "Dining chair",
      "u": 5.4,
      "v": 6.35,
      "w": 0.45,
      "d": 0.5,
      "kind": "planned",
      "room": "living"
    },
    {
      "id": "C3",
      "name": "Dining chair",
      "u": 4.7,
      "v": 8.15,
      "w": 0.45,
      "d": 0.5,
      "kind": "planned",
      "room": "living"
    },
    {
      "id": "C4",
      "name": "Dining chair",
      "u": 5.4,
      "v": 8.15,
      "w": 0.45,
      "d": 0.5,
      "kind": "planned",
      "room": "living"
    },
    {
      "id": "S1",
      "name": "Single bed",
      "u": 9.25,
      "v": 2.85,
      "w": 1.9,
      "d": 1,
      "kind": "authored",
      "room": "bedroom",
      "note": "Current saved bed footprint rotated across the room. Keeps both window approaches and the door swing clear. Bedding/pillow part of the family; a second bed needs a later co-op layout review."
    },
    {
      "id": "S2",
      "name": "Bedroom cabinet",
      "u": 8.25,
      "v": 0.4,
      "w": 0.8,
      "d": 0.45,
      "kind": "planned",
      "room": "bedroom",
      "note": "Clothes/books and a wall note, clear of the rear window approach."
    },
    {
      "id": "K1",
      "name": "Kitchen worktop",
      "u": 11.15,
      "v": 7.6,
      "w": 0.6,
      "d": 2,
      "kind": "planned",
      "room": "kitchen",
      "note": "Kettle, mugs, bowls, tins and bottles on the side-wall worktop. Keeps the front window boardable. No plumbing/stove mechanic has been committed."
    },
    {
      "id": "K2",
      "name": "Kitchen cupboard",
      "u": 8.35,
      "v": 9.2,
      "w": 0.8,
      "d": 0.45,
      "kind": "planned",
      "room": "kitchen",
      "note": "Food and small props; wall shelf above. Positioned beside the window approach."
    },
    {
      "id": "R1",
      "name": "Indoor firewood rack",
      "u": 10.65,
      "v": 6.4,
      "w": 0.915,
      "d": 0.37,
      "kind": "authored",
      "room": "supply",
      "note": "Close to the exterior work door. Carry wood inside, deposit/withdraw, then bring firewood to the hearth."
    },
    {
      "id": "R2",
      "name": "Plank reserve",
      "u": 8.35,
      "v": 6.45,
      "w": 1.5,
      "d": 0.35,
      "kind": "planned",
      "room": "supply",
      "note": "Separate visible storage for processed boards; clear of both door swings."
    },
    {
      "id": "R3",
      "name": "Supply chest",
      "u": 8.45,
      "v": 4.35,
      "w": 0.8,
      "d": 0.45,
      "kind": "planned",
      "room": "supply",
      "note": "Shells, flashlight batteries and first-aid candidates; contents/loot rules remain open."
    },
    {
      "id": "R4",
      "name": "Tall supply cabinet",
      "u": 11.3,
      "v": 4.25,
      "w": 0.45,
      "d": 0.8,
      "kind": "planned",
      "room": "supply",
      "note": "Loose tool and consumable storage, with wall tool rack beside it."
    },
    {
      "id": "O1",
      "name": "Chopping block",
      "u": 14.5,
      "v": 5.2,
      "w": 0.6,
      "d": 0.6,
      "kind": "authored",
      "room": "yard",
      "note": "Outside, exposed to the woods.2×2m work pad; original supported log and axe contact remain at their authored height."
    },
    {
      "id": "O2",
      "name": "Sawing station",
      "u": 13.35,
      "v": 8,
      "w": 1.5,
      "d": 1.01,
      "kind": "authored",
      "room": "yard",
      "note": "Separate2.8×2.6m pad for operator and saw motion. Use this station for boards."
    },
    {
      "id": "O3",
      "name": "Incoming log pile",
      "u": 16,
      "v": 8.5,
      "w": 1.3,
      "d": 0.6,
      "kind": "planned",
      "room": "yard",
      "note": "Temporary outdoor stock next to the processing route; not a replacement for indoor storage."
    }
  ],
  "wallDressings": [
    {
      "id": "M1",
      "name": "Deer head above hearth",
      "u": 0.14,
      "v": 4.82,
      "note": "Mounted above the hearth, not a floor obstruction. Existing mount height/silhouette retained."
    },
    {
      "id": "M2",
      "name": "Second deer mount",
      "u": 6.7,
      "v": 0.14,
      "note": "A second instance/variation for the rear living wall."
    },
    {
      "id": "P1",
      "name": "Framed forest picture",
      "u": 0.14,
      "v": 3.3,
      "note": "Existing picture asset; same PSX texture language."
    },
    {
      "id": "P2",
      "name": "Bedroom picture / note",
      "u": 8.14,
      "v": 1.6,
      "note": "Frame and personal note on bedroom side of partition."
    },
    {
      "id": "A1",
      "name": "Map / coat hooks",
      "u": 6.9,
      "v": 9.85,
      "note": "Useful map, hooks and door mat near entry; height keeps the walking lane clear."
    },
    {
      "id": "A2",
      "name": "Tool rack",
      "u": 9.85,
      "v": 4.12,
      "note": "Axe/shotgun support and wall storage in tool room."
    }
  ],
  "designNotes": [
    "Owner approved the12×10m drawn layout on2026-10-12; rebuild and runtime fit are in progress.",
    "Rebuild from modular pieces and update apertures, roof, sockets, proxies and navigation together; retain original prop scale rather than stretching the whole cabin.",
    "Open living room contains no central partition. Enclosed bedroom and supply room retain clear uses.",
    "Seven1.2m windows are proposed breach points. Window count and defense burden remain adjustable.",
    "Dashed footprints are asset-bible candidates, not claims that those meshes are already authored.",
    "Door swings and clearance zones are spatial proposals; collision qualification follows the approved layout."
  ]
};
export const CABIN_PLAN_SHA256="c7c37cb382c0923e71485164d7e37d033ed731ad3b9e96f22ab6a5d2bdb4991c";
