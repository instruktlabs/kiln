export function bindFightMouse(canvas,{active,attack}){
 const press=e=>{if(!active()||e.pointerType!=='mouse'||![0,2].includes(e.button))return;e.preventDefault();attack(e.button===0?'light':'heavy');};
 const menu=e=>{if(active())e.preventDefault();};
 canvas.addEventListener('pointerdown',press);canvas.addEventListener('contextmenu',menu);
 return()=>{canvas.removeEventListener('pointerdown',press);canvas.removeEventListener('contextmenu',menu);};
}
