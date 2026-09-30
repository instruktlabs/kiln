# Tool reference

Generated from the public registry with `bun run docs:tools`. Change the registry to update names, descriptions or schemas; use `bun run docs:tools --check` to check for drift.

Use these tools through your connected agent. Supply `code` once, then pass the returned `programRef` to later calls. References identify exact source revisions. [Source workflow](programs.md) · [Camera recipes](cameras.md) · [Geometry guide](geometry.md).

Call `kiln_discover({capabilities:true})` for the current host limits and export/camera support. The schema below describes inputs; actual image replies include fidelity and capture metadata. Source reads return exact text, edits return a new revision, and failed builds return their errors.

The packaged local host additionally injects kiln_project, kiln_material and kiln_review. Projects are optional. Authoring tools there accept projectId, projectRevision and independent materialDependencies; projectId:null explicitly selects standalone work. These optional schemas come from the same registry and are advertised only when their host stores are available; connected tools/list is authoritative. See [projects and live review](projects-and-live-review.md) for CLI equivalents, project packages and exact reviewed saves. The base schemas below remain available to embeddings without workspace services.

Renderer capabilities distinguish configured routing, dependency readiness, endpoint health and unverified authentication. Use kiln_renderer with action=reprobe after renderer setup or repair to refresh the current session. Material capabilities list approved texture IDs by allowed slot for the selected evaluator. Capability inspection never starts a renderer, requests an image or fetches texture bytes; ordinary catalog search is offline. See [renderer readiness and resources](rendering.md).

## kiln_discover

Discover Kiln operations, assemblies, recipes and current host capabilities. Omit arguments for a compact overview. Search with ordinary modeling language using query; refine with family, kind or tags. Fetch complete contracts/examples with ids (up to six exact IDs or executable names). Overview/search pages default to six summaries. Recipes guide construction without restricting the asset. Search runs locally without models or network calls.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
        "recipe"
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
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
  "required": [
    "action"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_validate

Check program syntax, sandbox rules and retired globals before building. Returns findings with codes, lines and repair hints where available; use kiln_render to evaluate geometry and see the asset. Supply code OR a retained programRef. Even invalid drafts return a ref; read it with kiln_source.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "code": {
      "description": "New source. Supply code OR programRef.",
      "type": "string"
    },
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    }
  },
  "additionalProperties": false
}
```

</details>

## kiln_render

Build a program and return geometry metrics, a bounded part-path preview and images. If partsTruncated, use kiln_inspect listParts for remaining paths. Omit capture for six views; choose preset/cells for orbit grids or version kiln.capture.v1 plus shots for part-local framing, perspective and separate images. Check viewFidelity before judging materials. Failed builds return errors without an image. Supply code OR a retained programRef. Even invalid drafts return a ref; read it with kiln_source.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "code": {
      "description": "New source. Supply code OR programRef.",
      "type": "string"
    },
    "capture": {
      "description": "Use legacy preset/cells for an orbit sheet, or version kiln.capture.v1 with 1..9 shots for exact part framing, local axes, perspective and separate images. Omit for six default views.",
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "version": {
              "type": "string",
              "const": "kiln.capture.v1"
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
              "description": "Grid shape as COLSxROWS. Default 3x2. Choose fewer views for simple shapes, up to 3x3 for more angles.",
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
              "description": "One camera per cell, in row-major order. Omit to use the preset default cameras. Must not exceed the preset capacity (max 9 overall).",
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
                    "description": "0 = eye level, positive looks down, negative from below. Clamped to -89..89."
                  },
                  "zoom": {
                    "description": "Padding multiplier around the asset bounds for this cell only. Omit for the default framing; below 1 crops in, above 1 pulls back.",
                    "type": "number"
                  },
                  "name": {
                    "description": "Cell label. Auto-derived from the angles if omitted.",
                    "type": "string"
                  }
                },
                "required": [
                  "azimuthDeg",
                  "elevationDeg"
                ],
                "additionalProperties": false
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
      "description": "compact (default) counts repeated findings; full returns every finding and rule",
      "type": "string",
      "enum": [
        "compact",
        "full"
      ]
    },
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    }
  },
  "additionalProperties": false
}
```

</details>

## kiln_screenshot_animation

Review animation images, poseBounds and loopClosure endpoint evidence. loopIntent is createClip({loop}); open is valid for one-shots; closed endpoints do not prove smooth velocity. Check motion, attachments and requested clearance; sampled bounds do not certify continuous contact or collision safety. Use shot for camera/subject, frameTimes for phases, and framing locked (default) or follow. Add phases when symmetry hides motion. The program must define animate(). Check viewFidelity before judging materials. Supply code OR a retained programRef. Even invalid drafts return a ref; read it with kiln_source.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "shot": {
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
      "description": "compact (default) counts repeated findings; full returns every finding and rule",
      "type": "string",
      "enum": [
        "compact",
        "full"
      ]
    },
    "code": {
      "description": "New source. Supply code OR programRef.",
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
    }
  },
  "required": [
    "clip"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_view_interior

Render roof-off floor-plan, dollhouse, and eye-level cutaway views. Optional versioned capture selects custom roof-off shots. Select a roof by nodeName or let Kiln resolve its role/name. Review roofsHidden and warnings for unresolved occlusion. Supply code OR a retained programRef. Even invalid drafts return a ref; read it with kiln_source.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "capture": {
      "type": "object",
      "properties": {
        "version": {
          "type": "string",
          "const": "kiln.capture.v1"
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
    "code": {
      "description": "New source. Supply code OR programRef.",
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
    }
  },
  "additionalProperties": false
}
```

</details>

## kiln_inspect

List part paths and inspect joints, clearances and edit preservation. listParts filters names/paths with query; follow partListing.nextOffset on the same programRef/query. measure/surfacePairs return distances, not fit certificates. compare reports static changes and separate animation channel changes; paths adds complete static subtree summaries. image:false skips rendering. Otherwise use part/orbit or exact shot; check viewFidelity for materials. Supply code OR a retained programRef. Even invalid drafts return a ref; read it with kiln_source.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "image": {
      "description": "False: requires listParts/measure/surfacePairs/compare; no image or camera controls. Default true.",
      "type": "boolean"
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
      "description": "Exact shot; omit part/view/orbit controls.",
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
    },
    "code": {
      "description": "New source. Supply code OR programRef.",
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
    }
  },
  "additionalProperties": false
}
```

</details>

## kiln_edit

Atomically apply ordered exact-string replacements and render. Copy anchors from kiln_source. Returns programRef, parentRef, diff and preservation comparing static data and animation channels. Review changes; use kiln_inspect compare for more pages or protected subtrees. Failed comparison preserves the repair; render:false leaves preservation not_assessed. capture selects cameras; includeCode returns full source.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "code": {
      "description": "New source. Supply code OR programRef.",
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
        ],
        "additionalProperties": false
      },
      "description": "Edits applied in order against the program. If any one fails to match, none are applied and the reply says which. Batch related changes into a single call."
    },
    "render": {
      "description": "Render the patched program and return the views (default true). false = patch only.",
      "type": "boolean"
    },
    "capture": {
      "description": "Use legacy preset/cells for an orbit sheet, or version kiln.capture.v1 with 1..9 shots for exact part framing, local axes, perspective and separate images. Omit for six default views.",
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "version": {
              "type": "string",
              "const": "kiln.capture.v1"
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
              "description": "Grid shape as COLSxROWS. Default 3x2. Choose fewer views for simple shapes, up to 3x3 for more angles.",
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
              "description": "One camera per cell, in row-major order. Omit to use the preset default cameras. Must not exceed the preset capacity (max 9 overall).",
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
                    "description": "0 = eye level, positive looks down, negative from below. Clamped to -89..89."
                  },
                  "zoom": {
                    "description": "Padding multiplier around the asset bounds for this cell only. Omit for the default framing; below 1 crops in, above 1 pulls back.",
                    "type": "number"
                  },
                  "name": {
                    "description": "Cell label. Auto-derived from the angles if omitted.",
                    "type": "string"
                  }
                },
                "required": [
                  "azimuthDeg",
                  "elevationDeg"
                ],
                "additionalProperties": false
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
    "programRef": {
      "type": "string",
      "pattern": "^(?:sha256:[a-f0-9]{64}|p_[a-f0-9]{12}(?:[a-f0-9]{4}){0,13})(?![\\s\\S])",
      "description": "Returned p_ handle or full sha256 ref."
    },
    "includeCode": {
      "description": "Return the full updated source. Defaults to false with programRef, true with code.",
      "type": "boolean"
    }
  },
  "required": [
    "edits"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_source

Read a saved program revision without changing it. Returns exact source text in bounded pages, or searches for literal text with surrounding context. Copy edit anchors from code. Follow nextOffset for more; use matchOffset + 1 to find the next match. Offsets count UTF-16 characters, not bytes.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
    "programRef",
    "offset",
    "limit"
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
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
      },
      "additionalProperties": false
    },
    "backdrop": {
      "description": "Preview backdrop: the one the reviewed sheet used.",
      "type": "string",
      "enum": [
        "neutral",
        "dark",
        "light"
      ]
    }
  },
  "required": [
    "collection",
    "programRef",
    "name"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_assets

collections discovers storage; catalog searches all configured collections; list searches one. Both searches paginate. get returns a build record/downloads; restore loads exact source for kiln_source/kiln_edit. Collection is not project membership. Binary-only assets cannot restore source.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
  },
  "required": [
    "action",
    "collection",
    "offset",
    "limit"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_present

Present one exact saved revision. Supporting MCP App clients show an interactive 3D card with GLB, editable ZIP, and source downloads. Every host receives exact artifact descriptors with resource URIs in the JSON result; verified hosts may also receive core MCP resource-link blocks. This tool does not launch a local browser in coding harnesses. Call after saving or when the user wants to see or download an asset.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
    "collection",
    "assetId",
    "revisionId"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_export

Export one saved revision. Default editable returns exact GLB, source, preview, and manifest descriptors; configured hosts may include portable editable ZIP download URLs. Opt-in runtime returns a standalone GLB plus a versioned metadata sidecar, moving only Kiln review clips out of GLB extras while preserving native animation and application metadata. Resource URIs remain readable through resources/read. Canonical revisions never change; no binary bytes are placed in tool text.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
    "collection",
    "assetId",
    "revisionId",
    "profile"
  ],
  "additionalProperties": false
}
```

</details>

## kiln_import

Copy a pinned asset revision between configured collections, preserving identity and provenance. Copies never track later edits automatically. For a GLB or downloaded ZIP on disk, use kiln import <file> --collection <name> in the CLI.

<details>
<summary>Input JSON Schema</summary>


```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
    "collection",
    "assetId",
    "revisionId",
    "sourceCollection"
  ],
  "additionalProperties": false
}
```

</details>
