import { FARMER_NAME } from '../constants';

/** Public strings from SPEC 13.1 and the pilot; no coordinates or review text. */
export const FARM_STRINGS = {
  walk: 'Walk the farm', overview: 'Back to overview', controls: 'Controls', leavePlay: 'Leave play', joystick: 'Move', joystickDrive: 'Drive', resetView: 'Reset view',
  approach: 'Approach a door or tractor', drive: 'Drive tractor', leaveTractor: 'Leave tractor',
  river: 'Use the timber bridge to cross the river.',
  doorBlocked: `Door stopped: ${FARMER_NAME} is in its path.`,
  exitBlocked: 'Exit is blocked. Drive into an open area.',
  obstacle: 'Obstacle ahead. Reverse or steer clear.',
  tractorKeyboard: 'Tractor controls: W/S accelerate and reverse; A/D steer. Trailer stays parked.',
  tractorTouch: 'Tractor controls: use the joystick. The trailer stays parked.',
  walkHint: 'WASD to walk · Drag to look · Scroll to zoom · Shift to run · E to interact · Escape to leave',
  helpKeyboard: `Walk in third person: the camera follows ${FARMER_NAME}. Use W A S D or arrows to walk and Shift to run. Drag to look around and scroll to zoom, on foot or in the tractor. E interacts. Escape returns to overview.`,
  helpTouch: `Use the joystick to walk in third person; the camera follows ${FARMER_NAME}. Drag the scene to look and pinch to zoom. Near a door or the tractor a button appears to open it, drive or leave. Back to overview ends the walk.`,
  pack: 'Reading farm inventory…', graphics: 'Starting graphics…',
  lighting: 'Preparing lighting. First visits can take longer…',
  build: 'Building the farm, paths and interactions…',
  firstFrame: 'Drawing the first view. Preparing materials and shadows…',
} as const;
export const DOOR_LABELS = { farmhouse: 'farmhouse door', watermill: 'mill door', barn: 'barn doors', 'fence-gate': 'paddock gate' } as const;
export const doorPrompt = (label: string, open: boolean) => `${open ? 'Close' : 'Open'} ${label}`;
export const doorStatus = (label: string, opening: boolean) => `${opening ? 'Opening' : 'Closing'} ${label}.`;
