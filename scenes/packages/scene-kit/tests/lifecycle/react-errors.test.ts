import { expect, test } from 'bun:test';
import { bindFiberErrors } from '../../src/contract/react-errors';
import { createReadyGate } from '../../src/contract/core';
test('all owned React error channels reach the contract once and detach at teardown',()=>{
  let count=0,escaped=0;const report=()=>escaped++;
  const root={onCaughtError:report,onUncaughtError:report,onRecoverableError:report};
  const gate=createReadyGate({ready(){},error(){count++;},schedule(){return 1;},cancel(){}});
  const off=bindFiberErrors(root,error=>gate.fail(error));root.onCaughtError(new Error('fixture'));root.onUncaughtError(new Error('second'));root.onRecoverableError(new Error('third'));
  expect(count).toBe(1);expect(escaped).toBe(0);off();root.onCaughtError(new Error('late'));expect(count).toBe(1);expect(escaped).toBe(0);
});
test('incompatible pinned reconciler shape fails explicitly',()=>{expect(()=>bindFiberErrors({},()=>{})).toThrow('error callbacks');});
