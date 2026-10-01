import { useEffect, useMemo } from 'react';
import { useRuntime } from '../internal/runtime';
import { SystemOrder, useSystem } from '../lifecycle';
import { createPresetBlender, type PresetBlender, type PresetValues } from './core';
export * from './core';
export function usePresets<P extends PresetValues>(presets: Record<string, P>, initial: string): PresetBlender<P> {
  const runtime = useRuntime();
  const blender = useMemo(() => createPresetBlender(presets, initial, { reduced: () => runtime.motion.reduced, dev: !!import.meta.env.KILN_DEV }), [presets, initial, runtime]);
  useSystem('presets', SystemOrder.path + 50, () => blender.update(runtime.clock.delta));
  useEffect(() => {
    const name = runtime.devParams.preset ?? ((import.meta.env.KILN_DEV || import.meta.env.KILN_TEST) ? new URLSearchParams(location.search).get('preset') : undefined);
    if (typeof name === 'string') blender.set(name, { immediate: true });
  }, [blender, runtime]);
  return blender;
}
