# Third-party notices

Kiln uses dependencies under their own licenses. Their package license files remain part
of the installed dependency tree. The optional renderer uses `webgpu` 0.6.1; it is resolved
as a dependency, not repacked or stripped. Its distributed `LICENSE.md` contains the Dawn
and Tint notice below. This notice is reproduced from the pinned installed artifact; npm's
short license metadata is not a replacement for that file.

## Dawn and Tint (webgpu 0.6.1)

Copyright 2017-2025 The Dawn & Tint Authors

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Candidate native/WASM dependency inventory

Inspected October 6, 2026. Runtime bundles keep npm dependencies external;
installation retains their own package files and notices. This table identifies
the native/WASM packages used by this candidate, not a replacement license for
their transitive components. Optional Strands/provider dependencies are separate
and are not required for CLI/MCP authoring.

| Package inspected | Package license metadata | Distributed notice / provenance |
| --- | --- | --- |
| `webgpu@0.6.2` | MIT metadata; distributed Dawn/Tint notice is BSD-3-Clause | `webgpu/LICENSE.md`, reproduced above; native Dawn/Tint supplied by the package |
| `@napi-rs/canvas@1.0.10` | MIT | `@napi-rs/canvas/LICENSE`; platform package contains the Skia-based native binding |
| `sharp@0.35.5` | Apache-2.0 | `sharp/LICENSE` |
| `@img/sharp-win32-x64@0.35.5` | Apache-2.0 AND LGPL-3.0-or-later | package `LICENSE` and `versions.json`; the inspected binary includes libvips 8.18.7 and additional native libraries |
| `manifold-3d@3.5.4` | Apache-2.0 | `manifold-3d/LICENSE`, JavaScript and WASM distribution |
| `xatlasjs@0.2.0` | MIT | `xatlasjs/LICENSE`, copyright Jonathan Young; JavaScript and WASM distribution |

Sharp selects platform-specific binaries during installation; consult the
[upstream installation documentation](https://sharp.pixelplumbing.com/install/)
and the exact installed platform package. A Windows receipt does not inventory
another platform's native artifacts. If distributing a self-contained archive
with dependencies, retain their license files and complete that archive's native
notice/source inventory before publication. Kiln's npm tarball does not embed
these native binaries. Full standalone-binary redistribution is not qualified by
this inventory.
