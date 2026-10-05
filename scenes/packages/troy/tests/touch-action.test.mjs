import test from 'node:test';import assert from 'node:assert/strict';
import {bindDiscreteAction} from '../web/touch-action.mjs';
class Button extends EventTarget{disabled=false;}
function event(button,type,fields={}){const e=new Event(type,{cancelable:true});for(const [k,v]of Object.entries(fields))Object.defineProperty(e,k,{value:v});button.dispatchEvent(e);}
const touch=(id=1,x=20)=>({pointerType:'touch',pointerId:id,isPrimary:true,clientX:x,clientY:20});
test('touch release activates once even when Chrome suppresses its compatibility click after a gesture',()=>{
 const b=new Button();let n=0;const release=bindDiscreteAction(b,()=>n++);
 event(b,'pointerdown',touch());event(b,'pointerup',touch());assert.equal(n,1);
 event(b,'click',{...touch(),detail:1});assert.equal(n,1);
 event(b,'click',{detail:0});assert.equal(n,2);
 event(b,'pointerdown',touch(2));event(b,'pointerup',touch(2));assert.equal(n,3);
 event(b,'click',{pointerType:'mouse',pointerId:2,detail:1});assert.equal(n,4);
 release();event(b,'click',{detail:0});assert.equal(n,4);
});
test('cancelled, dragged and disabled touches cannot activate a discrete action',()=>{
 const b=new Button();let n=0;bindDiscreteAction(b,()=>n++);
 event(b,'pointerdown',touch());event(b,'pointercancel',touch());event(b,'pointerup',touch());event(b,'click',{...touch(),detail:1});
 event(b,'pointerdown',touch(2));event(b,'pointerup',touch(2,60));event(b,'click',{...touch(2,60),detail:1});
 b.disabled=true;event(b,'pointerdown',touch(4));event(b,'pointerup',touch(4));event(b,'click',{detail:0});assert.equal(n,0);
});
test('a compatibility click retargeted onto Show after Hide cannot reopen the controls',()=>{
 const doc={},hide=new Button(),show=new Button();hide.ownerDocument=show.ownerDocument=doc;let hidden=false;
 bindDiscreteAction(hide,()=>{hidden=true;});bindDiscreteAction(show,()=>{hidden=false;});
 event(hide,'pointerdown',touch());event(hide,'pointerup',touch());assert.equal(hidden,true);
 event(show,'click',{...touch(),detail:1});assert.equal(hidden,true);
 event(show,'pointerdown',touch(2));event(show,'pointerup',touch(2));assert.equal(hidden,false);
});
test('another touch can activate an attack while movement and block fingers remain held',()=>{
 const b=new Button();let n=0;bindDiscreteAction(b,()=>n++);const second={...touch(7),isPrimary:false};
 event(b,'pointerdown',second);event(b,'pointerup',second);event(b,'click',{...second,detail:1});assert.equal(n,1);
});
