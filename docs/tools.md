# Tool reference

Generated with `bun run docs:tools` from the definitions the packaged stdio server advertises (the same bytes as `src/generated/mcp-manifest.json`). Change the registry in `src/tools/registry.ts` to update names, descriptions or schemas; `bun run docs:tools --check` reports drift.

Use these tools through your connected agent. Supply `code` once (or `file`, a path inside the workspace), then pass the returned `programRef` to later calls. References identify exact source revisions and are kept in the workspace program store across sessions and processes. [Source workflow](programs.md) · [Camera recipes](cameras.md) · [Geometry guide](geometry.md).

Call `kiln_discover({capabilities:true})` for the current host limits, the configured project and export/camera support. Nested records that the schemas keep opaque (`draft`, `patch`, `payload`, `capture`, `shot`) are described in full by `kiln_discover({ ids: ["shape:project-draft"] })` and the other `shape:` entries. The schema below describes inputs; actual image replies include fidelity and capture metadata. Source reads return exact text, edits return a new revision, and failed builds return their errors.

kiln_project, kiln_material and kiln_review are injected by the packaged local host; an embedding advertises them only when it supplies the corresponding store, and the connected tools/list is authoritative. Projects are optional: authoring tools accept projectId, projectRevision and independent materialDependencies, and projectId:null selects standalone work. See [projects and live review](projects-and-live-review.md) for CLI equivalents, project packages and exact reviewed saves.

Renderer capabilities distinguish configured routing, dependency readiness, endpoint health and unverified authentication. Use kiln_renderer with action=reprobe after renderer setup or repair to refresh the current session. Material capabilities list approved texture IDs by allowed slot for the selected evaluator. Capability inspection never starts a renderer, requests an image or fetches texture bytes; ordinary catalog search is offline. See [renderer readiness and resources](rendering.md).

## kiln_discover

Discover Kiln operations, assemblies, recipes, tool-input shapes and current host capabilities. Omit arguments for a compact overview. Search with ordinary modeling language using query; refine with family, kind or tags. Fetch complete contracts/examples with ids (up to six exact IDs, executable names or shape: ids). Overview/search pages default to six summaries. Recipes guide construction without restricting the asset. Search runs locally without models or network calls.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "ids": {
      "minItems": 1,
      "maxItems": 6,
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      }
    },
    "overview": {
      "type": "boolean",
      "const": true
    },
    "capabilities": {
      "type": "boolean",
      "const": true
    },
    "family": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "kind": {
      "type": "string",
      "enum": [
        "operation",
        "assembly",
        "recipe",
        "shape"
      ]
    },
    "tags": {
      "minItems": 1,
      "maxItems": 8,
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      }
    },
    "offset": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10000
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 12
    }
  },
  "additionalProperties": false
}
```

</details>

## kiln_renderer

Inspect status, or reprobe after renderer setup/repair to refresh this session and reset failed starts. Never installs, starts, stops or renders. Preserves CPU/local/remote selection; environment/credential changes require a host restart. Read viewFidelity after rendering.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "action": {
      "default": "status",
      "type": "string",
      "enum": [
        "status",
        "reprobe"
      ]
    }
  },
  "additionalProperties": false
}
```

</details>

## kiln_validate

Check program syntax, sandbox rules and retired globals before building. Returns findings with codes, lines and repair hints where available; use kiln_render to evaluate geometry and see the asset. Supply code, programRef OR file (kept in the program store across sessions and processes, never evicted). Invalid drafts keep a ref.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "code": {
      "description": "New source.",
      "type": "string"
    },
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    },
    "file": {
      "description": "A program file inside the workspace, relative to its root.",
      "type": "string",
      "minLength": 1,
      "maxLength": 1024
    }
  }
}
```

</details>

## kiln_render

Build and return metrics, part paths and images. If partsTruncated, use kiln_inspect listParts. Omit capture for six views, preset/cells for orbit grids, or kiln.capture.v1/v2 shots for exact orthographic/perspective cameras; v2 adds hide. Check viewFidelity before judging materials. Failed builds return errors without images. Supply code, programRef OR file (kept in the program store across sessions and processes, never evicted). Invalid drafts keep a ref.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "code": {
      "description": "New source.",
      "type": "string"
    },
    "capture": {
      "description": "Omit for six views; preset/cells for orbit sheets. Use kiln.capture.v1 or v2 with 1..9 shots for exact cameras. v2 adds hide: exact paths or unique names. Framing retains subject bounds.",
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "version": {
              "type": "string",
              "enum": [
                "kiln.capture.v1",
                "kiln.capture.v2"
              ]
            },
            "shots": {
              "minItems": 1,
              "maxItems": 9,
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "subject": {
                    "type": "object",
                    "properties": {
                      "path": {
                        "type": "string"
                      },
                      "name": {
                        "type": "string"
                      }
                    },
                    "additionalProperties": false
                  },
                  "visibility": {
                    "type": "string",
                    "enum": [
                      "context",
                      "isolate"
                    ]
                  },
                  "hide": {
                    "maxItems": 64,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 1024
                    }
                  },
                  "camera": {
                    "oneOf": [
                      {
                        "type": "object",
                        "properties": {
                          "type": {
                            "type": "string",
                            "const": "orbit"
                          },
                          "azimuthDeg": {
                            "type": "number"
                          },
                          "elevationDeg": {
                            "type": "number"
                          },
                          "relativeTo": {
                            "type": "string",
                            "enum": [
                              "world",
                              "asset",
                              "part"
                            ]
                          },
                          "padding": {
                            "type": "number",
                            "exclusiveMinimum": 0,
                            "maximum": 100
                          }
                        },
                        "required": [
                          "type"
                        ],
                        "additionalProperties": false
                      },
                      {
                        "type": "object",
                        "properties": {
                          "type": {
                            "type": "string",
                            "const": "explicit"
                          },
                          "projection": {
                            "type": "string",
                            "enum": [
                              "orthographic",
                              "perspective"
                            ]
                          },
                          "position": {
                            "minItems": 3,
                            "maxItems": 3,
                            "type": "array",
                            "items": {
                              "type": "number"
                            }
                          },
                          "target": {
                            "minItems": 3,
                            "maxItems": 3,
                            "type": "array",
                            "items": {
                              "type": "number"
                            }
                          },
                          "relativeTo": {
                            "type": "string",
                            "enum": [
                              "world",
                              "asset",
                              "part",
                              "local"
                            ]
                          },
                          "frame": {
                            "type": "object",
                            "properties": {
                              "origin": {
                                "minItems": 3,
                                "maxItems": 3,
                                "type": "array",
                                "items": {
                                  "type": "number"
                                }
                              },
                              "rotation": {
                                "minItems": 3,
                                "maxItems": 3,
                                "type": "array",
                                "items": {
                                  "type": "number"
                                }
                              }
                            },
                            "additionalProperties": false
                          },
                          "framing": {
                            "type": "string",
                            "enum": [
                              "explicit",
                              "bounds"
                            ]
                          },
                          "padding": {
                            "type": "number",
                            "exclusiveMinimum": 0,
                            "maximum": 100
                          },
                          "targetOffset": {
                            "minItems": 3,
                            "maxItems": 3,
                            "type": "array",
                            "items": {
                              "type": "number"
                            }
                          },
                          "up": {
                            "minItems": 3,
                            "maxItems": 3,
                            "type": "array",
                            "items": {
                              "type": "number"
                            }
                          },
                          "halfHeight": {
                            "type": "number",
                            "exclusiveMinimum": 0
                          },
                          "fovDeg": {
                            "type": "number",
                            "exclusiveMinimum": 0,
                            "exclusiveMaximum": 180
                          },
                          "near": {
                            "type": "number",
                            "exclusiveMinimum": 0
                          },
                          "far": {
                            "type": "number",
                            "exclusiveMinimum": 0
                          }
                        },
                        "required": [
                          "type",
                          "projection",
                          "position"
                        ],
                        "additionalProperties": false
                      }
                    ]
                  }
                },
                "additionalProperties": false
              }
            },
            "cols": {
              "type": "integer",
              "minimum": 1,
              "maximum": 3
            },
            "size": {
              "type": "integer",
              "minimum": 128,
              "maximum": 2048
            },
            "output": {
              "type": "string",
              "enum": [
                "grid",
                "separate"
              ]
            },
            "backdrop": {
              "description": "neutral (default); light for dark parts, dark for light parts.",
              "type": "string",
              "enum": [
                "neutral",
                "dark",
                "light"
              ]
            }
          },
          "required": [
            "version",
            "shots"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "preset": {
              "description": "COLSxROWS; default 3x2. Fewer views for simple shapes, up to 3x3.",
              "type": "string",
              "enum": [
                "1x1",
                "1x2",
                "2x1",
                "3x1",
                "2x2",
                "3x2",
                "3x3"
              ]
            },
            "cells": {
              "description": "Row-major cameras; omit for preset defaults. Count cannot exceed preset capacity (max 9).",
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "azimuthDeg": {
                    "type": "number",
                    "description": "0 = front, 90 = right, 180 = back, 270 = left. Wraps."
                  },
                  "elevationDeg": {
                    "type": "number",
                    "description": "0 eye level; positive above, negative below. Clamped -89..89."
                  },
                  "zoom": {
                    "description": "Bounds padding: below 1 crops, above 1 pulls back; omit for auto-framing.",
                    "type": "number"
                  },
                  "name": {
                    "description": "Label; defaults to angles.",
                    "type": "string"
                  }
                },
                "required": [
                  "azimuthDeg",
                  "elevationDeg"
                ]
              }
            },
            "backdrop": {
              "description": "neutral (default); light for dark parts, dark for light parts.",
              "type": "string",
              "enum": [
                "neutral",
                "dark",
                "light"
              ]
            }
          },
          "additionalProperties": false
        }
      ]
    },
    "detail": {
      "description": "compact (default) groups findings by code; lean: verdict, blockers, metrics only; full: every finding, rule and part plus the retained report path",
      "type": "string",
      "enum": [
        "lean",
        "compact",
        "full"
      ]
    },
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    },
    "file": {
      "description": "A program file inside the workspace, relative to its root.",
      "type": "string",
      "minLength": 1,
      "maxLength": 1024
    },
    "projectId": {
      "description": "Project; omit for the configured default, null for standalone.",
      "anyOf": [
        {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,79}$"
        },
        {
          "type": "null"
        }
      ]
    },
    "projectRevision": {
      "description": "Exact project revision.",
      "type": "string",
      "pattern": "^r_[0-9]{10}_[a-f0-9]{64}$"
    },
    "materialDependencies": {
      "description": "Exact material pins for this call; project locks cannot be replaced.",
      "maxItems": 512,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$"
          },
          "revisionId": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "sha256": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "role": {
            "type": "string",
            "maxLength": 100
          }
        },
        "required": [
          "resourceId",
          "revisionId",
          "sha256"
        ],
        "additionalProperties": false
      }
    }
  }
}
```

</details>

## kiln_screenshot_animation

Review animation images, poseBounds and loopClosure endpoint evidence. loopIntent is createClip({loop}); open is valid for one-shots; closed endpoints do not prove smooth velocity. Check motion, attachments and requested clearance; sampled bounds do not certify continuous contact or collision safety. Use shot for camera/subject, frameTimes for phases, and framing locked (default) or follow. Add phases when symmetry hides motion. The program must define animate(). Check viewFidelity before judging materials. Supply code, programRef OR file (kept in the program store across sessions and processes, never evicted). Invalid drafts keep a ref.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "shot": {
      "description": "One exact camera shot. Shape: kiln_discover ids [\"shape:camera-shot\"].",
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "measureParts": {
      "description": "Exact names or paths of subtrees measured together at each phase, independent of camera selection.",
      "minItems": 1,
      "maxItems": 16,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string"
          },
          "name": {
            "type": "string"
          }
        },
        "additionalProperties": false
      }
    },
    "frames": {
      "type": "integer",
      "minimum": 2,
      "maximum": 6
    },
    "frameTimes": {
      "description": "Ordered phase fractions 0..1; mutually exclusive with frames.",
      "minItems": 1,
      "maxItems": 9,
      "type": "array",
      "items": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      }
    },
    "framing": {
      "type": "string",
      "enum": [
        "locked",
        "follow"
      ]
    },
    "size": {
      "description": "Frame size in px; default 256.",
      "type": "integer",
      "minimum": 128,
      "maximum": 1024
    },
    "detail": {
      "description": "compact (default) groups findings by code; lean: verdict, blockers, metrics only; full: every finding, rule and part plus the retained report path",
      "type": "string",
      "enum": [
        "lean",
        "compact",
        "full"
      ]
    },
    "code": {
      "description": "New source.",
      "type": "string"
    },
    "clip": {
      "type": "string",
      "description": "The animation clip to view, by name (e.g. \"walk\", \"attack\"). Must be one your animate() returns."
    },
    "camera": {
      "description": "Camera angle: right (default — side profile, best for leg swing + knee bend direction), front (reveals sideways/lateral motion), back, left, top, or three-quarter.",
      "type": "string"
    },
    "perFrame": {
      "description": "Return the frames as separate high-res images instead of one composite grid. Default false.",
      "type": "boolean"
    },
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    },
    "file": {
      "description": "A program file inside the workspace, relative to its root.",
      "type": "string",
      "minLength": 1,
      "maxLength": 1024
    },
    "projectId": {
      "description": "Project; omit for the configured default, null for standalone.",
      "anyOf": [
        {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,79}$"
        },
        {
          "type": "null"
        }
      ]
    },
    "projectRevision": {
      "description": "Exact project revision.",
      "type": "string",
      "pattern": "^r_[0-9]{10}_[a-f0-9]{64}$"
    },
    "materialDependencies": {
      "description": "Exact material pins for this call; project locks cannot be replaced.",
      "maxItems": 512,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$"
          },
          "revisionId": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "sha256": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "role": {
            "type": "string",
            "maxLength": 100
          }
        },
        "required": [
          "resourceId",
          "revisionId",
          "sha256"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "clip"
  ]
}
```

</details>

## kiln_view_interior

Render roof-off floor-plan, dollhouse, and eye-level cutaway views. Optional versioned capture selects custom roof-off shots. Select a roof by nodeName or let Kiln resolve its role/name. Review roofsHidden and warnings for unresolved occlusion. Supply code, programRef OR file (kept in the program store across sessions and processes, never evicted). Invalid drafts keep a ref.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "capture": {
      "description": "Cameras, as kiln_render capture takes them. Shape: kiln_discover ids [\"shape:capture\"].",
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "code": {
      "description": "New source.",
      "type": "string"
    },
    "nodeName": {
      "description": "Override: lift the roof by exact node name instead of by role. Matches that node and its children. Normally OMIT it — Kiln finds the roof from its semantic role (anything built with createRoofPlanes/createGableRoof), falling back to historical \"Roof\" naming.",
      "type": "string"
    },
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    },
    "file": {
      "description": "A program file inside the workspace, relative to its root.",
      "type": "string",
      "minLength": 1,
      "maxLength": 1024
    },
    "projectId": {
      "description": "Project; omit for the configured default, null for standalone.",
      "anyOf": [
        {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,79}$"
        },
        {
          "type": "null"
        }
      ]
    },
    "projectRevision": {
      "description": "Exact project revision.",
      "type": "string",
      "pattern": "^r_[0-9]{10}_[a-f0-9]{64}$"
    },
    "materialDependencies": {
      "description": "Exact material pins for this call; project locks cannot be replaced.",
      "maxItems": 512,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$"
          },
          "revisionId": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "sha256": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "role": {
            "type": "string",
            "maxLength": 100
          }
        },
        "required": [
          "resourceId",
          "revisionId",
          "sha256"
        ],
        "additionalProperties": false
      }
    }
  }
}
```

</details>

## kiln_inspect

List part paths and inspect joints, clearances and edit preservation. listParts filters names/paths with query; follow partListing.nextOffset on the same programRef/query. measure/surfacePairs return distances, not fit certificates. compare reports static changes and separate animation channel changes; paths adds complete static subtree summaries. image:false skips rendering. Otherwise use part/orbit or exact shot; check viewFidelity for materials. Supply code, programRef OR file (kept in the program store across sessions and processes, never evicted). Invalid drafts keep a ref.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "image": {
      "description": "False: requires listParts/measure/surfacePairs/compare; no image or camera controls. Default true.",
      "type": "boolean"
    },
    "detail": {
      "description": "compact (default) groups findings by code; lean: verdict, blockers, metrics only; full: every finding, rule and part plus the retained report path",
      "type": "string",
      "enum": [
        "lean",
        "compact",
        "full"
      ]
    },
    "listParts": {
      "description": "List exported-scene paths, including nested parts. Default 80, max 100 per page. Follow partListing.nextOffset with the same programRef/query. image:false avoids rendering.",
      "type": "object",
      "properties": {
        "query": {
          "description": "Case-insensitive substring of name or exact encoded path; not a regex.",
          "type": "string",
          "maxLength": 4096
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "placement": {
          "description": "Add world position, rotation, scale, mirroring and bounds per part; pages of 50.",
          "type": "boolean"
        }
      },
      "additionalProperties": false
    },
    "surfacePairs": {
      "description": "[from,to] pairs of exact listParts paths or unambiguous node names; check surfaceMeasurements.status and each result.",
      "minItems": 1,
      "maxItems": 12,
      "type": "array",
      "items": {
        "minItems": 2,
        "maxItems": 2,
        "type": "array",
        "items": {
          "type": "string",
          "maxLength": 4096
        }
      }
    },
    "compare": {
      "description": "Static geometry/material/transform/bounds under current host settings. Follow nextOffset; paths adds complete subtrees.",
      "type": "object",
      "properties": {
        "programRef": {
          "type": "string",
          "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])"
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "paths": {
          "description": "Exact baseline node paths, scene-prefixed without primitive children. Complete subtree summaries.",
          "minItems": 1,
          "maxItems": 12,
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 4096
          }
        }
      },
      "required": [
        "programRef"
      ],
      "additionalProperties": false
    },
    "measure": {
      "description": "Default anchors: origin/local-point distance. Surface: disjoint mesh triangles, omit points. Rest pose, asset units. Check status/bounds; no solid clearance/attachment proof.",
      "type": "object",
      "properties": {
        "mode": {
          "type": "string",
          "enum": [
            "anchors",
            "surface"
          ]
        },
        "from": {
          "type": "object",
          "properties": {
            "subject": {
              "type": "object",
              "properties": {
                "path": {
                  "type": "string"
                },
                "name": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            },
            "point": {
              "minItems": 3,
              "maxItems": 3,
              "type": "array",
              "items": {
                "type": "number"
              }
            }
          },
          "required": [
            "subject"
          ],
          "additionalProperties": false
        },
        "to": {
          "type": "object",
          "properties": {
            "subject": {
              "type": "object",
              "properties": {
                "path": {
                  "type": "string"
                },
                "name": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            },
            "point": {
              "minItems": 3,
              "maxItems": 3,
              "type": "array",
              "items": {
                "type": "number"
              }
            }
          },
          "required": [
            "subject"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "from",
        "to"
      ],
      "additionalProperties": false
    },
    "shot": {
      "description": "One exact camera shot. Shape: kiln_discover ids [\"shape:camera-shot\"].",
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "code": {
      "description": "New source.",
      "type": "string"
    },
    "part": {
      "description": "Frame named part and descendants (case-insensitive, substring fallback). Omit for whole asset.",
      "type": "string"
    },
    "view": {
      "description": "front/right/back/left/top/three-quarter (default). Orbit angles override.",
      "type": "string"
    },
    "azimuthDeg": {
      "description": "Orbit degrees: 0 front, 90 right, 180 back, 270 left. Wraps.",
      "type": "number"
    },
    "elevationDeg": {
      "description": "Elevation degrees: 0 eye level, positive above. Clamped -89..89.",
      "type": "number"
    },
    "zoom": {
      "description": "Bounds padding 1..4; default 1.2. Larger = more context.",
      "type": "number"
    },
    "isolate": {
      "description": "Hide surrounding geometry. Requires part; default false.",
      "type": "boolean"
    },
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    },
    "file": {
      "description": "A program file inside the workspace, relative to its root.",
      "type": "string",
      "minLength": 1,
      "maxLength": 1024
    },
    "projectId": {
      "description": "Project; omit for the configured default, null for standalone.",
      "anyOf": [
        {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,79}$"
        },
        {
          "type": "null"
        }
      ]
    },
    "projectRevision": {
      "description": "Exact project revision.",
      "type": "string",
      "pattern": "^r_[0-9]{10}_[a-f0-9]{64}$"
    },
    "materialDependencies": {
      "description": "Exact material pins for this call; project locks cannot be replaced.",
      "maxItems": 512,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$"
          },
          "revisionId": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "sha256": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "role": {
            "type": "string",
            "maxLength": 100
          }
        },
        "required": [
          "resourceId",
          "revisionId",
          "sha256"
        ],
        "additionalProperties": false
      }
    }
  }
}
```

</details>

## kiln_edit

Atomically apply ordered exact-string replacements and render. Copy anchors from kiln_source. Supply code, programRef OR file. Returns programRef (kept in the program store across sessions and processes, never evicted), parentRef, diff and preservation comparing static data and animation channels. Review changes; use kiln_inspect compare for more pages or protected subtrees. Failed comparison preserves the repair; render:false leaves preservation not_assessed. capture selects cameras; includeCode returns full source.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "code": {
      "description": "New source.",
      "type": "string"
    },
    "edits": {
      "minItems": 1,
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "oldString": {
            "type": "string",
            "description": "The exact text to replace, copied verbatim from the program (including whitespace and indentation, and with no line-number prefixes). Must be unique unless replaceAll is true."
          },
          "newString": {
            "type": "string",
            "description": "The replacement text. Use an empty string to delete."
          },
          "replaceAll": {
            "description": "Replace every occurrence instead of failing when oldString matches more than once.",
            "type": "boolean"
          }
        },
        "required": [
          "oldString",
          "newString"
        ]
      },
      "description": "Edits applied in order against the program. If any one fails to match, none are applied and the reply says which. Batch related changes into a single call."
    },
    "render": {
      "description": "Render the patched program and return the views (default true). false = patch only.",
      "type": "boolean"
    },
    "capture": {
      "description": "Cameras, as kiln_render capture takes them. Shape: kiln_discover ids [\"shape:capture\"].",
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "detail": {
      "description": "compact (default) groups findings by code; lean: verdict, blockers, metrics only; full: every finding, rule and part plus the retained report path",
      "type": "string",
      "enum": [
        "lean",
        "compact",
        "full"
      ]
    },
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    },
    "file": {
      "description": "A program file inside the workspace, relative to its root.",
      "type": "string",
      "minLength": 1,
      "maxLength": 1024
    },
    "includeCode": {
      "description": "Return the full updated source. Defaults to false with programRef, true with code.",
      "type": "boolean"
    },
    "projectId": {
      "description": "Project; omit for the configured default, null for standalone.",
      "anyOf": [
        {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,79}$"
        },
        {
          "type": "null"
        }
      ]
    },
    "projectRevision": {
      "description": "Exact project revision.",
      "type": "string",
      "pattern": "^r_[0-9]{10}_[a-f0-9]{64}$"
    },
    "materialDependencies": {
      "description": "Exact material pins for this call; project locks cannot be replaced.",
      "maxItems": 512,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$"
          },
          "revisionId": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "sha256": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "role": {
            "type": "string",
            "maxLength": 100
          }
        },
        "required": [
          "resourceId",
          "revisionId",
          "sha256"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "edits"
  ]
}
```

</details>

## kiln_source

Read a saved program revision without changing it. Returns exact source text in bounded pages, or searches for literal text with surrounding context. Copy edit anchors from code. Follow nextOffset for more; use matchOffset + 1 to find the next match. Offsets count UTF-16 characters, not bytes.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    },
    "offset": {
      "default": 0,
      "description": "UTF-16 character offset; use nextOffset to continue.",
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "limit": {
      "default": 8000,
      "description": "Maximum characters returned.",
      "type": "integer",
      "minimum": 1,
      "maximum": 16000
    },
    "query": {
      "description": "Find literal text at or after offset; return bounded surrounding source.",
      "type": "string",
      "minLength": 1,
      "maxLength": 1000
    }
  },
  "required": [
    "programRef"
  ]
}
```

</details>

## kiln_project

Manage optional shared workspace projects: list discovers IDs; get reads the current or an exact historical configuration; create adds a project; update needs the exact expectedRevision and replaces each supplied top-level field. Assets and materials are authored, saved and exported without a project, and creating one never binds unrelated authoring. Design preferences, inventory, references, delivery profiles and pinned material dependencies are versioned; review annotations do not change trusted QA or authorize a release. CLI and the local dashboard use the same records. export returns an MCP resource URI for an exact editable project ZIP with normalized material maps and recipes, or a runtime GLB/metadata ZIP; only inventory entries linked to saved revisions contribute assets, and referenced concept images and acquisition archives are not embedded.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "list",
        "get",
        "create",
        "update",
        "export"
      ]
    },
    "projectId": {
      "description": "get, update, export.",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "revisionId": {
      "description": "get, export: an exact revision; omit for the current one.",
      "type": "string",
      "pattern": "^r_[0-9]{10}_[a-f0-9]{64}$"
    },
    "expectedRevision": {
      "description": "update: the revision being replaced; a stale value is a conflict.",
      "type": "string",
      "pattern": "^r_[0-9]{10}_[a-f0-9]{64}$"
    },
    "draft": {
      "description": "create: name, brief, design, inventory, deliveryProfiles, materialDependencies, references, reviews; optional projectId. Shape: kiln_discover({ ids: ['shape:project-draft'] }).",
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "patch": {
      "description": "update: the same top-level fields as draft; each supplied field replaces its previous value whole. Shape: kiln_discover({ ids: ['shape:project-patch'] }).",
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "profile": {
      "description": "export: editable (default) keeps source and resources; runtime is GLB plus metadata.",
      "type": "string",
      "enum": [
        "editable",
        "runtime"
      ]
    }
  },
  "required": [
    "action"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_material

Manage optional immutable material resources in this workspace. presets discovers shipped architecture, wood, metal, fabric and ground recipes; create-preset bakes one with an explicit seed, creator and license; list returns compact material/revision summaries; get returns full provenance, hashes, map conventions, physical repeat scale and a code-ready portable material spec; create-procedural bakes bounded editable layer recipes including optional height-derived normals; import accepts complete normalized records with embedded PNG bytes. No action downloads URLs or executes source. Pin the returned materialId/revisionId through per-invocation materialDependencies or project dependencies before authored evaluation resolves the resources; no project is required.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "presets",
        "create-preset",
        "list",
        "get",
        "create-procedural",
        "import"
      ]
    },
    "tag": {
      "description": "presets, list: keep one tag.",
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "presetId": {
      "description": "create-preset: an id from presets.",
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "seed": {
      "description": "create-preset.",
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    },
    "size": {
      "description": "create-preset: map edge in pixels; default 256.",
      "anyOf": [
        {
          "type": "number",
          "const": 64
        },
        {
          "type": "number",
          "const": 128
        },
        {
          "type": "number",
          "const": 256
        },
        {
          "type": "number",
          "const": 512
        }
      ]
    },
    "creator": {
      "description": "create-preset.",
      "type": "string",
      "minLength": 1,
      "maxLength": 1000
    },
    "license": {
      "description": "create-preset: spdx, url and attribution.",
      "type": "object",
      "properties": {
        "spdx": {
          "type": "string",
          "minLength": 1,
          "maxLength": 1000
        },
        "url": {
          "type": "string",
          "maxLength": 2000,
          "format": "uri"
        },
        "attribution": {
          "type": "string",
          "maxLength": 4000
        }
      },
      "required": [
        "spdx",
        "url",
        "attribution"
      ],
      "additionalProperties": false
    },
    "materialId": {
      "description": "get: the id a project palette lists as resourceId; create-preset: optional id.",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "revisionId": {
      "description": "get: the immutable revision; omitted, the material's only revision.",
      "type": "string",
      "pattern": "^sha256:[a-f0-9]{64}$"
    },
    "draft": {
      "description": "create-procedural: materialId, name, tileable, sources, maps with layered procedural specs; optional tags, physicalSizeMeters, parameters. Shape: kiln_discover({ ids: ['shape:material-draft'] }).",
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    },
    "payload": {
      "description": "import: schemaVersion 1 and complete normalized records with embedded PNG bytes. Shape: kiln_discover({ ids: ['shape:material-import'] }).",
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    }
  },
  "required": [
    "action"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_review

Read persisted Kiln observation history, pin an operation against normal retention, or save an exact completed reviewed operation into a collection without re-execution. Pinning does not pause an agent. save requires the displayed expectedRevision and matching trusted host requirements, preserves exact source/GLB/capture, and does not assert QA acceptance. Missing or evicted evidence is an error.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "list",
        "get",
        "pin",
        "save"
      ]
    },
    "projectId": {
      "description": "list: only operations bound to this project.",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "offset": {
      "description": "list: page start; default 0.",
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "limit": {
      "description": "list: page size; default 20.",
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "operationId": {
      "description": "get, pin, save.",
      "type": "string",
      "pattern": "^op_[a-f0-9-]{36}$"
    },
    "pinned": {
      "description": "pin: true keeps the operation past normal retention.",
      "type": "boolean"
    },
    "expectedRevision": {
      "description": "save: the revision the listing displayed.",
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "collection": {
      "description": "save: destination collection; default project.",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "name": {
      "description": "save.",
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "assetId": {
      "description": "save: revise this asset.",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "parentRevision": {
      "description": "save: the revision being revised.",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "description": {
      "description": "save.",
      "type": "string",
      "maxLength": 4000
    },
    "tags": {
      "description": "save.",
      "maxItems": 30,
      "type": "array",
      "items": {
        "type": "string",
        "maxLength": 80
      }
    }
  },
  "required": [
    "action"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_save

Save a completed source revision into the user-requested collection, or project when none was requested. Persists exact GLB, source, preview and build record. Use programRef returned by render/edit. To revise an asset, pass assetId and parentRevision; earlier revisions stay intact. Returns downloadable resources; draft renders never populate collections.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "collection": {
      "default": "project",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$",
      "description": "Collection ID (list with kiln_assets action=collections): the user destination, else project."
    },
    "programRef": {
      "type": "string"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "assetId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "parentRevision": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "tags": {
      "maxItems": 30,
      "type": "array",
      "items": {
        "type": "string",
        "maxLength": 80
      }
    },
    "brief": {
      "type": "string",
      "maxLength": 8000
    },
    "description": {
      "type": "string",
      "maxLength": 4000
    },
    "attribution": {
      "type": "object",
      "properties": {
        "model": {
          "type": "string",
          "maxLength": 200
        },
        "harness": {
          "type": "string",
          "maxLength": 200
        },
        "author": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "backdrop": {
      "description": "Preview backdrop: the one the reviewed sheet used.",
      "type": "string",
      "enum": [
        "neutral",
        "dark",
        "light"
      ]
    },
    "projectId": {
      "description": "Project; omit for the configured default, null for standalone.",
      "anyOf": [
        {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]{0,79}$"
        },
        {
          "type": "null"
        }
      ]
    },
    "projectRevision": {
      "description": "Exact project revision.",
      "type": "string",
      "pattern": "^r_[0-9]{10}_[a-f0-9]{64}$"
    },
    "materialDependencies": {
      "description": "Exact material pins for this call; project locks cannot be replaced.",
      "maxItems": 512,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$"
          },
          "revisionId": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "sha256": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "role": {
            "type": "string",
            "maxLength": 100
          }
        },
        "required": [
          "resourceId",
          "revisionId",
          "sha256"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "programRef",
    "name"
  ]
}
```

</details>

## kiln_assets

Browse saved assets: collections discovers storage; catalog searches all configured collections; list searches one. Both searches paginate. get returns a build record/downloads; restore loads exact source for kiln_source/kiln_edit. Collection is not project membership. Binary-only assets cannot restore source.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "action": {
      "default": "list",
      "type": "string",
      "enum": [
        "collections",
        "catalog",
        "list",
        "get",
        "restore"
      ]
    },
    "collection": {
      "default": "project",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$",
      "description": "Collection ID (list with kiln_assets action=collections): the user destination, else project."
    },
    "assetId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "revisionId": {
      "description": "get, restore: the saved revision; omitted, the newest.",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "query": {
      "type": "string",
      "maxLength": 200
    },
    "offset": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "limit": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 50
    }
  }
}
```

</details>

## kiln_present

Present one exact saved revision. Supporting MCP App clients show an interactive 3D card with GLB, editable ZIP, and source downloads. Every host receives exact artifact descriptors with resource URIs in the JSON result; verified hosts may also receive core MCP resource-link blocks. This tool does not launch a local browser in coding harnesses. Call after saving or when the user wants to see or download an asset.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "collection": {
      "default": "project",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$",
      "description": "Collection ID (list with kiln_assets action=collections): the user destination, else project."
    },
    "assetId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "revisionId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    }
  },
  "required": [
    "assetId",
    "revisionId"
  ]
}
```

</details>

## kiln_export

Export one saved revision. Default editable returns exact GLB, source, preview, and manifest descriptors; configured hosts may include portable editable ZIP download URLs. Opt-in runtime returns a standalone GLB plus a versioned metadata sidecar, moving only Kiln review clips out of GLB extras while preserving native animation and application metadata. Resource URIs remain readable through resources/read. Canonical revisions never change; no binary bytes are placed in tool text.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "collection": {
      "default": "project",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$",
      "description": "Collection ID (list with kiln_assets action=collections): the user destination, else project."
    },
    "assetId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "revisionId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "profile": {
      "default": "editable",
      "description": "editable preserves canonical source/GLB/build resources. runtime returns a standalone GLB and versioned review-metadata sidecar; no source bundle or geometry optimization.",
      "type": "string",
      "enum": [
        "editable",
        "runtime"
      ]
    }
  },
  "required": [
    "assetId",
    "revisionId"
  ]
}
```

</details>

## kiln_import

Copy a pinned asset revision between configured collections, preserving identity and provenance. Copies never track later edits automatically. For a GLB or downloaded ZIP on disk, use kiln import <file> --collection <name> in the CLI.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "type": "object",
  "properties": {
    "collection": {
      "default": "project",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$",
      "description": "Collection ID (list with kiln_assets action=collections): the user destination, else project."
    },
    "assetId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "revisionId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$"
    },
    "sourceCollection": {
      "default": "project",
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]{0,79}$",
      "description": "Collection ID (list with kiln_assets action=collections): the user destination, else project."
    }
  },
  "required": [
    "assetId",
    "revisionId"
  ]
}
```

</details>
