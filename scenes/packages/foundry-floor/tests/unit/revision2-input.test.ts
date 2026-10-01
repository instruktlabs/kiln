import { expect, test } from 'bun:test';
import { createInputApi } from '@kiln-scenes/scene-kit';
import { readDriveInput, DRIVE_ACTIONS, DRIVE_TOUCH_BUTTONS, drivingTrafficRange } from '../../src/campus/drive/input';
test('Shift and touch boost map to the same held input alongside independent pedals and steering',()=>{
  const input=createInputApi();input.setEnabled(true);
  input.key('KeyW',true);input.key('ShiftLeft',true);
  expect(readDriveInput(input.state)).toMatchObject({throttle:1,boost:true,brake:0});
  input.key('ShiftLeft',false);expect(readDriveInput(input.state).boost).toBe(false);
  input.clear();input.setMove(.7,0,false);input.setAction(DRIVE_ACTIONS.throttle,1);input.setAction(DRIVE_ACTIONS.boost,1);
  expect(readDriveInput(input.state)).toMatchObject({steer:.7,throttle:1,boost:true});
  input.setAction(DRIVE_ACTIONS.brake,1);expect(readDriveInput(input.state)).toMatchObject({brake:1,boost:false});
  input.setEnabled(false);expect(readDriveInput(input.state)).toMatchObject({throttle:0,steer:0,brake:0,boost:false});
  expect(DRIVE_TOUCH_BUTTONS.map(b=>b.label)).toEqual(['Throttle','Brake / reverse','Boost']);
  expect(DRIVE_TOUCH_BUTTONS.every(b=>b.hold)).toBe(true);input.dispose();
});
test('boosted speed extends traffic lookahead through stopping distance',()=>{
  const data={traffic:{range:80,minGap:.8},brake:7};
  expect(drivingTrafficRange(data,0)).toBe(80);
  expect(drivingTrafficRange(data,43.5)).toBeGreaterThan(43.5**2/(2*.8*7));
});
