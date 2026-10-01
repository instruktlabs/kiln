import type { JSX } from 'react';
// Scoped, instance-owned stylesheet: no document.body/head mutation or global reset.
export const HUD_CSS = `
.ks-root{position:relative;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;color:#fff;font:14px/1.45 system-ui,sans-serif}
.ks-root canvas{touch-action:none;display:block}.ks-root:focus-visible{outline:3px solid #fff;outline-offset:-4px}
.ks-hud{position:absolute;inset:0;pointer-events:none;z-index:2;container:ks-hud/inline-size}.ks-hud>*{pointer-events:auto}
.ks-button,.ks-select{min-width:44px;min-height:44px;border:1px solid #879593;border-radius:9px;background:#142522;color:#fff;padding:10px 14px;font:inherit;cursor:pointer;touch-action:none;user-select:none}
.ks-button:hover{background:#29433d}.ks-button:disabled{opacity:.7;cursor:default}.ks-button:focus-visible,.ks-select:focus-visible{outline:3px solid #fff;outline-offset:3px}
.ks-panel{background:rgba(11,24,22,.94);color:#fff;border:1px solid #879593;border-radius:12px;padding:16px;max-width:min(420px,calc(100% - 32px));box-sizing:border-box}
.ks-panel a{color:#baf0ef}.ks-panel a:focus-visible{outline:3px solid #fff}.ks-panel h2,.ks-panel h3{margin:0 0 8px;font-size:1.1em}.ks-panel p{margin:8px 0}
.ks-toolbar{position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;gap:8px;flex-wrap:wrap}
.ks-help,.ks-credits{position:absolute;top:max(70px,calc(env(safe-area-inset-top) + 58px));right:max(12px,env(safe-area-inset-right));max-height:calc(100% - 100px);overflow:auto}
.ks-help-button,.ks-credits-button{pointer-events:auto}.ks-segmented{display:flex;gap:4px;flex-wrap:wrap}.ks-segmented [aria-checked=true]{background:#3b6659;border-color:#dafff2}
.ks-menu,.ks-menu-items{display:contents}.ks-menu-break{display:none;flex-basis:100%;height:0;order:9}
.ks-menu-caret{display:inline-block;margin-left:8px;border:4px solid transparent;border-top-color:currentColor;border-bottom:0;vertical-align:middle}
.ks-menu[data-open]>.ks-menu-trigger{background:#3b6659;border-color:#dafff2}.ks-menu[data-open] .ks-menu-caret{transform:rotate(180deg)}
.ks-menu[data-collapse=narrow]>.ks-menu-trigger{display:none}
.ks-menu[data-collapse=always]:not([data-open])>.ks-menu-items>:not(.ks-panel){display:none}
.ks-menu[data-collapse=always][data-open]>.ks-menu-break{display:block}.ks-menu[data-collapse=always][data-open]>.ks-menu-items>:not(.ks-panel){order:10}
@container ks-hud (max-width:719px){
  .ks-menu[data-collapse=narrow]>.ks-menu-trigger{display:inline-block}
  .ks-menu[data-collapse=narrow]:not([data-open])>.ks-menu-items>:not(.ks-panel){display:none}
  .ks-menu[data-collapse=narrow][data-open]>.ks-menu-break{display:block}.ks-menu[data-collapse=narrow][data-open]>.ks-menu-items>:not(.ks-panel){order:10}
}
.ks-hud[data-ks-hidden]>:not(.ks-hud-show){visibility:hidden}
.ks-hud[data-ks-hidden] :is(.ks-joystick,.ks-touch-buttons){visibility:visible}
.ks-hud-show{position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));opacity:.72}.ks-hud-show:is(:hover,:focus-visible){opacity:1}
.ks-status{position:absolute;bottom:max(14px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);max-width:min(520px,60%);text-align:center;pointer-events:none}
.ks-status:empty{display:none}.ks-interact{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));min-width:48px;min-height:48px}
.ks-exit-play{position:absolute;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top))}
.ks-joystick{position:absolute;left:max(20px,env(safe-area-inset-left));bottom:max(24px,env(safe-area-inset-bottom));width:132px;height:132px;box-sizing:border-box;border:2px solid #c5ddd7;border-radius:50%;background:rgba(11,24,22,.85);touch-action:none;user-select:none;display:grid;place-items:center}
.ks-joystick-thumb{width:56px;height:56px;box-sizing:border-box;border:2px solid #fff;border-radius:50%;background:#456e62;pointer-events:none}
.ks-touch-buttons{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));display:grid;grid-template-columns:auto auto;gap:10px;touch-action:none;user-select:none}
.ks-touch-button{min-width:56px;min-height:56px}.ks-slot-primary{grid-column:1;grid-row:2}.ks-slot-secondary{grid-column:1;grid-row:1}.ks-slot-pedal-upper{grid-column:2;grid-row:1}.ks-slot-pedal-lower{grid-column:2;grid-row:2}
.ks-touch-buttons.ks-exit-play{left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));right:auto;bottom:auto}
.ks-fade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;z-index:10}.ks-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.ks-dev-panel{position:absolute;left:12px;top:70px;max-height:75%;overflow:auto;font:12px/1.5 ui-monospace,monospace}.ks-dev-panel dl{display:grid;grid-template-columns:auto auto;gap:4px 12px}.ks-dev-panel dd{margin:0}
@media(prefers-reduced-motion:reduce){.ks-root *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
export function SceneStyles(): JSX.Element { return <style data-kiln-styles="">{HUD_CSS}</style>; }
