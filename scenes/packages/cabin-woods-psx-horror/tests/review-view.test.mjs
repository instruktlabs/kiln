import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewViewPose,REVIEW_VIEWS} from '../src/game/layout.mjs';
test('review aim passes through the narrow chopping target from the actual eye position',()=>{
 const view=REVIEW_VIEWS.chopping,pose=reviewViewPose(view,view.position);
 const eye=[view.position[0],1.61,view.position[2]];
 const remaining=Math.hypot(view.target[0]-eye[0],view.target[2]-eye[2]);
 assert.ok(Math.abs(eye[1]+Math.tan(pose.pitch)*remaining-view.target[1])<1e-10);
});
