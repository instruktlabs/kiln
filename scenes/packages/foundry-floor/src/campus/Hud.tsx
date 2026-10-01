// SPDX-License-Identifier: MIT
// Separate persistent location/Exit bar inside; both place HUDs remain in their own lazy chunks.
import { lazy, Suspense, useSyncExternalStore } from 'react';
import { HudButton } from '@kiln-scenes/scene-kit';
import { useCampusSession } from './session';

const ExteriorHud = lazy(() => import('./exterior').then(m => ({ default: m.ExteriorHud })));
const InteriorHud = lazy(() => import('./interior').then(m => ({ default: m.InteriorHud })));

function ExitButton() {
  const campus = useCampusSession();
  const moving = useSyncExternalStore(campus.hud.subscribe, () => campus.hud.getSnapshot().moving, () => campus.hud.getSnapshot().moving);
  return <div className="fc-interior-location"><HudButton className="fc-exit" disabled={moving} onClick={() => campus.exit()}>Exit to campus</HudButton><span>South-west building · Level 1 · Cutaway</span></div>;
}

export function CampusHud() {
  const campus = useCampusSession();
  const place = useSyncExternalStore(campus.hud.subscribe, () => campus.hud.getSnapshot().place, () => campus.hud.getSnapshot().place);
  const interior = place === 'interior' ? campus.interior : null;
  if (interior) return <><style>{`
    .ks-hud>.fc-interior-location{position:absolute;left:12px;top:12px;z-index:4;display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px);padding:5px;background:#101e24f2;border-radius:6px;color:#e8f4f3;font:12px/1.4 system-ui,sans-serif}
    .fc-interior-location .ks-button{min-height:44px;white-space:nowrap}.fc-interior-location span{max-width:180px}
    .ks-hud>.ff-hud .ff-top{padding-top:74px}.ks-hud>.ff-hud .ff-status{top:74px}
  `}</style><ExitButton/><Suspense fallback={null}><InteriorHud session={interior}/></Suspense></>;
  return <Suspense fallback={null}><ExteriorHud/></Suspense>;
}
