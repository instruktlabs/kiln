import {bindDiscreteAction} from './touch-action.mjs';
// Troy's vanilla consumer follows scene-kit's visible primary toolbar,
// folded secondary menus, Hide/Show and Escape/focus conventions.
export function createSceneControls({canvas,heroPanel,nav,status,landingPanel,gatePanel,onExplore,onFight}){
 const doc=canvas.ownerDocument,toolbar=doc.createElement('div'),show=doc.createElement('button'),panel=doc.createElement('section'),groups=[],homes=[],actions=[];let mode='overview',disposed=false,menu=null,trigger=null;
 toolbar.id='main-controls';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Troy main controls');show.id='controls-toggle';show.type='button';show.textContent='Show controls';panel.id='scene-controls';panel.setAttribute('aria-label','Troy secondary controls');
 const button=(text,fn)=>{const b=doc.createElement('button');b.type='button';b.textContent=text;actions.push(bindDiscreteAction(b,fn));toolbar.append(b);return b;};
 const view=button('View',()=>open(menu==='view'?null:'view',view)),explore=button('Explore',()=>{onExplore();canvas.focus({preventScroll:true});}),fight=button('Fight',()=>{onFight();canvas.focus({preventScroll:true});}),more=button('More',()=>open(menu==='more'?null:'more',more));button('Hide controls',()=>visibility(true));
 for(const b of[view,more]){b.setAttribute('aria-controls',panel.id);b.setAttribute('aria-expanded','false');}
 function group(label,node){if(!node)return null;homes.push({node,parent:node.parentNode,next:node.nextSibling});const details=doc.createElement('details'),summary=doc.createElement('summary');summary.textContent=label;details.append(summary,node);panel.append(details);groups.push(details);return details;}
 const heroes=group('Heroes',heroPanel),views=group('Scene views',nav);group('Fleet playback',landingPanel);group('Gate',gatePanel);group('Scene details',status);
 doc.body.append(toolbar,show,panel);
 function open(next,from=null){menu=next;if(from)trigger=from;panel.hidden=!next;view.setAttribute('aria-expanded',String(next==='view'));more.setAttribute('aria-expanded',String(next==='more'));for(const g of groups){g.hidden=next==='view'?g!==views:g===views;g.open=next==='view'?g===views:mode!=='overview'&&g===heroes;}if(!next&&panel.contains(doc.activeElement))trigger?.focus({preventScroll:true});}
 function visibility(hidden){open(null);toolbar.hidden=hidden;show.hidden=!hidden;doc.body.classList.toggle('controls-closed',hidden);(hidden?show:canvas).focus({preventScroll:true});}
 const click=()=>visibility(false),escape=e=>{if(e.key==='Escape'&&menu){e.preventDefault();e.stopImmediatePropagation();open(null);trigger?.focus({preventScroll:true});}};
 actions.push(bindDiscreteAction(show,click));doc.addEventListener('keydown',escape,true);panel.hidden=true;show.hidden=true;doc.body.classList.remove('controls-closed');
 return{update(next){if(disposed||next===mode)return;mode=next;if(mode==='overview')delete doc.body.dataset.heroMode;else doc.body.dataset.heroMode=mode;explore.textContent=mode==='explore'?'Leave exploration':'Explore';fight.textContent=mode==='fight'?'Leave fight':'Fight';open(null);canvas.focus({preventScroll:true});},dispose(){if(disposed)return;disposed=true;for(const release of actions.splice(0))release();doc.removeEventListener('keydown',escape,true);for(const {node,parent,next}of homes)if(parent.isConnected)parent.insertBefore(node,next?.parentNode===parent?next:null);toolbar.remove();show.remove();panel.remove();delete doc.body.dataset.heroMode;doc.body.classList.remove('controls-closed');}};
}
