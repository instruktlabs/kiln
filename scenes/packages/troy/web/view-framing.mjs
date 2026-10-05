// Keep the reference scene's horizontal composition on narrow viewports.
export function portraitDistanceScale(aspect){if(!Number.isFinite(aspect)||aspect<=0)throw Error('Invalid viewport aspect');return Math.max(1,1.6/aspect);}
export function framePresetView(view,aspect){for(const key of ['position','target'])if(!Array.isArray(view?.[key])||view[key].length!==3||!view[key].every(Number.isFinite))throw Error('Invalid preset view');const scale=portraitDistanceScale(aspect);return{position:view.position.map((v,i)=>view.target[i]+(v-view.target[i])*scale),target:[...view.target]};}
