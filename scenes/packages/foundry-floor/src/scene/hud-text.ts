// SPDX-License-Identifier: MIT
// The HUD's words, kept pure so bun tests can hold them to the honesty rules (sim-spec 8 and 12 test 8): the mode
// and scale label is always present and megafab mode always carries the synthetic label.
import about from '../../data/about.json';
import { formatSimTime } from '../sim/clock';
import { SIM_CONFIG } from '../sim/config';
import type { E10State, FabKpis, FabMode } from '../sim/fab';

export interface HudInput { mode: FabMode; scale: number; simMs: number; synthetic: number }

export function modeLabel(mode: FabMode): string {
  return mode === 'pilot' ? SIM_CONFIG.modes.pilot.label : SIM_CONFIG.modes.megafab.label;
}

export function hudLines(s: HudInput): { mode: string; synthetic: string } {
  const scale = s.scale === 0 ? 'Paused' : `${s.scale}x`;
  return {
    mode: `${modeLabel(s.mode)}, ${scale}, ${formatSimTime(s.simMs)}`,
    synthetic: s.mode === 'megafab' ? `${s.synthetic} synthetic vehicles: ${SIM_CONFIG.modes.megafab.syntheticLabel}` : '',
  };
}

const LETTERS = about.stateLetters as Record<E10State, string>;
export const STATE_ORDER: readonly E10State[] = ['PRODUCTIVE', 'STANDBY', 'ENGINEERING', 'SCHEDULED_DOWN', 'UNSCHEDULED_DOWN', 'NON_SCHEDULED'];

export function kpiLines(k: FabKpis): string[] {
  const tools = STATE_ORDER.map(st => `${LETTERS[st]} ${k.toolCounts[st] ?? 0}`).join('  ');
  return [
    `WIP ${k.wipLots} lots`,
    `Out today ${k.lotsOutToday}`,
    `Moves/h ${Math.round(k.movesPerHour)}`,
    `Vehicles busy ${k.vehiclesBusy}/${k.vehiclesTotal}`,
    `Tools ${tools}`,
  ];
}

/** The cameras' controls and help (TASK-FF2 items 3 and 4). */
export const CAMERA_STRINGS = {
  walk: 'Walk', stopWalking: 'Stop walking', tour: 'Tour', stopTour: 'Stop tour', follow: 'Follow a wafer', stopFollowing: 'Stop following',
  controls: 'Controls', joystick: 'Walk',
  helpKeyboard: 'W A S D or the arrow keys to walk, Shift to run, drag to look around, the wheel to zoom, click a tool or stocker for its panel, Esc to stop walking.',
  helpTouch: 'Use the joystick to walk, drag to look around, pinch to zoom and tap a tool or stocker for its panel. Stop walking returns to the orbit view.',
  pickerTitle: 'Follow a wafer', pickerNote: 'Pick a lot: the camera follows its FOUP through its moves.', pickerEmpty: 'No lot is in the fab now.',
  closePanel: 'Close panel', closePicker: 'Close list', progress: 'Route progress',
} as const;

/** The tour caption's heading: the stop shown, or the stop the camera is on its way to. */
export function tourCaption(t: { stop: number; stops: number; label: string; phase: string }): string {
  return t.phase === 'fly' ? `Tour, on to stop ${t.stop + 1} of ${t.stops}: ${t.label}` : `Tour, stop ${t.stop + 1} of ${t.stops}: ${t.label}`;
}
