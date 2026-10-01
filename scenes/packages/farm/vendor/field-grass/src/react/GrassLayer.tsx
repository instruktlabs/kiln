// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useMemo } from 'react';
import type { TuftBuffers } from '../core/baked';
import { createGrassLayer, type GrassLayerOptions } from '../three/grassLayer';

export interface GrassLayerProps extends GrassLayerOptions {
  readonly buffers: TuftBuffers;
}

/** Thin R3F adapter. Data loading and interaction updates stay app-owned. */
export function GrassLayer({ buffers, ...options }: GrassLayerProps) {
  const layer = useMemo(
    () => createGrassLayer(buffers, options),
    [
      buffers,
      options.interaction,
      options.name,
      options.palette,
      options.preset,
      options.shape,
      options.style,
      options.sunDirection,
      options.timeNode,
    ],
  );
  useEffect(() => () => layer.dispose(), [layer]);
  return <primitive object={layer.mesh} />;
}
