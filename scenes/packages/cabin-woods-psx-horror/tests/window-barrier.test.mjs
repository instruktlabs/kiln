import test from 'node:test';import assert from 'node:assert/strict';
import {crossesBoardedOpening} from '../src/game/collision.mjs';
test('a melee path crossing the secured opening is blocked even through a visible gap',()=>{
 const window={position:[3,.95,-2.1],normal:[1,0,0],halfWidth:.68,boards:[2,2,2]};
 assert(crossesBoardedOpening([4.05,0,-2.1],[2.5,0,-2.1],[window]));
 assert(!crossesBoardedOpening([4.05,0,-2.1],[3.5,0,-2.1],[window]));
 assert(!crossesBoardedOpening([4.05,0,-.9],[2.5,0,-.9],[window]));
 assert(!crossesBoardedOpening([4.05,0,-2.1],[2.5,0,-2.1],[{...window,boards:[0,0,0]}]));
 const rotated={...window,position:[.4,.95,-4],normal:[0,0,-1]};assert(crossesBoardedOpening([.4,0,-5.05],[.4,0,-3.5],[rotated]));
});
