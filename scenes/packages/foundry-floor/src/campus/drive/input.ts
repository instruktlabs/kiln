// SPDX-License-Identifier: MIT
import type { InputState, TouchButtonDef } from '@kiln-scenes/scene-kit';
import type { CarInput } from './car';
export const DRIVE_ACTIONS={throttle:'fc-throttle',reverse:'fc-reverse',brake:'fc-brake',handbrake:'fc-handbrake',turnAround:'fc-turn-around',boost:'fc-boost'} as const;
export const DRIVE_TOUCH_BUTTONS:readonly TouchButtonDef[]=[
  {action:DRIVE_ACTIONS.throttle,label:'Throttle',slot:'pedal-upper',hold:true},
  {action:DRIVE_ACTIONS.reverse,label:'Brake / reverse',slot:'pedal-lower',hold:true},
  {action:DRIVE_ACTIONS.boost,label:'Boost',slot:'secondary',hold:true},
];
/** Keyboard and touch share one input contract; steering never releases a held pedal. */
export function readDriveInput(state:InputState):CarInput{
  const a=state.actions,throttle=Math.max(0,state.move.y,a[DRIVE_ACTIONS.throttle]??0),reverse=Math.max(0,-state.move.y,a[DRIVE_ACTIONS.reverse]??0);
  const brake=a[DRIVE_ACTIONS.brake]??0,handbrake=(a[DRIVE_ACTIONS.handbrake]??0)>0;
  return {throttle,reverse,steer:state.move.x,brake,handbrake,boost:throttle>0&&reverse===0&&brake===0&&!handbrake&&(state.run||(a[DRIVE_ACTIONS.boost]??0)>0)};
}
/** Keep the normal minimum, extending it for the current stopping distance under boost. */
export function drivingTrafficRange(data:{traffic:{range:number;minGap:number};brake:number},speed:number):number{
  return Math.max(data.traffic.range,speed*speed/(2*.8*data.brake)+data.traffic.minGap+20);
}
