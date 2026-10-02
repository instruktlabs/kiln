// SPDX-License-Identifier: MIT
// Inside, the Exit leads the interior toolbar and the location heads the status details; both place HUDs remain in
// their own lazy chunks.
import { lazy, Suspense, useSyncExternalStore } from 'react';
import { HudButton } from '@kiln-scenes/scene-kit';
import { useCampusSession } from './session';

const ExteriorHud = lazy(() => import('./exterior').then(m => ({ default: m.ExteriorHud })));
const InteriorHud = lazy(() => import('./interior').then(m => ({ default: m.InteriorHud })));

function ExitButton() {
  const campus = useCampusSession();
  const moving = useSyncExternalStore(campus.hud.subscribe, () => campus.hud.getSnapshot().moving, () => campus.hud.getSnapshot().moving);
  return <HudButton className="fc-exit" aria-label="Exit to campus" disabled={moving} onClick={() => campus.exit()}>Exit<span className="fc-exit-rest"> to campus</span></HudButton>;
}

export function CampusHud() {
  const campus = useCampusSession();
  const place = useSyncExternalStore(campus.hud.subscribe, () => campus.hud.getSnapshot().place, () => campus.hud.getSnapshot().place);
  const interior = place === 'interior' ? campus.interior : null;
  if (interior) return <><style>{`
    .fc-exit{white-space:nowrap}
    @container ks-hud (max-width:719px){.fc-exit-rest{display:none}}
  `}</style><Suspense fallback={null}><InteriorHud session={interior} leading={<ExitButton/>} location="South-west building · Level 1 · Cutaway"/></Suspense></>;
  return <Suspense fallback={null}><ExteriorHud/></Suspense>;
}
