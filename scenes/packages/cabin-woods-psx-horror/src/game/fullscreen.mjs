export function createFullscreenControl({element,document,onChange,onError}){
 const sync=()=>onChange(document.fullscreenElement===element);document.addEventListener('fullscreenchange',sync);sync();
 return {async toggle(){try{if(document.fullscreenElement===element)await document.exitFullscreen();else await element.requestFullscreen();sync();}catch{onError('Fullscreen is unavailable in this browser. You can continue in the page.');}},dispose(){document.removeEventListener('fullscreenchange',sync);}};
}
