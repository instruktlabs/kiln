// SPDX-License-Identifier: MIT
/** The camera before the pack loads: the landing view of data/layout.json (cameras.landing), which the world applies
 *  once the layout arrives from the pack; tests/unit/data.test.ts keeps the two equal. A module of its own, so the data
 *  tests read it without loading the kit and the renderer. */
export const LANDING_CAMERA = { position: [1.8, 1.6, 25.4] as [number, number, number], fov: 55 };
