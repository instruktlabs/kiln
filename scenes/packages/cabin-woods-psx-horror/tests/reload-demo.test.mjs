import test from 'node:test';import assert from 'node:assert/strict';
import {beginReload,advanceReload} from '../src/game/reload-demo.mjs';
import {createGameState,act} from '../src/game/state.mjs';
test('reload stows the flashlight, fills only at completion and never creates ammunition',()=>{
 const s=createGameState();s.weapon='shotgun';s.loadedShells=0;s.inventory.shells=1;
 const action=beginReload(s,{duration:2.4});assert(action);assert.equal(s.flashlight,false);
 advanceReload(action,s,1);assert.equal(s.loadedShells,0);advanceReload(action,s,1.4);
 assert.equal(s.loadedShells,1);assert.equal(s.inventory.shells,1);assert(action.done);advanceReload(action,s,5);assert.equal(s.inventory.shells,1);
});
test('empty chambers cannot fire even when reserve shells remain; firing consumes exactly one loaded shell',()=>{
 const s=createGameState();s.weapon='shotgun';s.loadedShells=0;assert.equal(act(s,'attack').ok,false);assert.equal(s.inventory.shells,6);
 s.loadedShells=2;assert(act(s,'attack').ok);assert.equal(s.loadedShells,1);assert.equal(s.inventory.shells,5);
});
