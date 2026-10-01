/**
 * The Golden Gate HUD layout, sized by its own container (the scene may be embedded in a page
 * narrower than the window). The toolbar sits top right with the flyover menu under it; the camera
 * buttons (keyboard and mouse layouts only: on touch, gestures move the camera and Reset view is in the
 * toolbar) sit bottom left, clear of the wrapping toolbar. The speed readout sits above the
 * status line (the deck-end prompt) at the bottom centre, or beside the joystick on a narrow HUD.
 *
 * Workaround for kit request GG-007: the kit's help and credits panels are absolutely positioned
 * with `max-height: calc(100% - 100px)`, which resolves against their containing block. Inside the
 * kit's `.ks-toolbar` (the kit's own usage) that block is the toolbar itself, about 44 px tall, so
 * the panel collapses to its padding and scrolls. Here the toolbar is static inside `.gg-top`,
 * which covers the whole HUD, so the panels size against the HUD. Where the toolbar wraps to a
 * second row, they open as a sheet at the bottom instead of over the toolbar. The top layer stacks
 * above the phone driving controls, so an open panel covers them rather than the reverse.
 */
export const GG_HUD_CSS = `
.gg-hud{position:absolute;inset:0;pointer-events:none;container:gg-hud/inline-size}
.gg-hud>*{pointer-events:auto}
.gg-hud>.gg-top{position:absolute;inset:0;z-index:1;pointer-events:none;display:flex;flex-direction:column;align-items:flex-end;gap:8px;box-sizing:border-box;
  padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 0 max(12px,env(safe-area-inset-left))}
.gg-top>.ks-toolbar{position:static;justify-content:flex-end;pointer-events:auto}
.gg-top>.gg-flights{display:flex;flex-direction:column;gap:8px;padding:12px;pointer-events:auto}
.gg-hud>.gg-camera{position:absolute;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 44px);left:max(12px,env(safe-area-inset-left));max-width:calc(100% - 24px)}
.gg-hud>.gg-bottom{position:absolute;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;
  width:max-content;max-width:min(520px,calc(100% - 24px));pointer-events:none}
.gg-bottom>.ks-status{position:static;transform:none;max-width:none}
.gg-bottom>.gg-speed{padding:6px 14px;max-width:none;font-variant-numeric:tabular-nums;white-space:nowrap}
.gg-hud>.ks-touch-buttons{z-index:1}
@container gg-hud (max-width:700px){
  .gg-top .ks-help,.gg-top .ks-credits{top:auto;bottom:max(12px,env(safe-area-inset-bottom));left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));
    max-width:none;max-height:calc(100% - 190px)}
  .gg-hud>.gg-bottom{bottom:max(190px,calc(env(safe-area-inset-bottom) + 180px));max-width:calc(100% - 24px)}
}
`;
