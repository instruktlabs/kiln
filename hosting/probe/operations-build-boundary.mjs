import assert from 'node:assert/strict';
import { assertProductionBoundary } from '../scripts/build-boundary.mjs';

export function assertOperationsBoundary(role, inputs) {
  const paths=inputs.map(p=>p.replaceAll('\\','/'));
  const allowed={tenant:['operations-tenant'],admission:['operations-admission'],gateway:[],
    operator:['operations-worker','qualification-accounts','qualification-rpc']}[role];
  assert(allowed);
  const production=paths.filter(path=>{
    assert(!/(?:^|\/)test\//.test(path));
    // Admission imports request header validation through request-job.ts. Its
    // transitive input list includes container-job.ts even when esbuild removes
    // unused execution code. Capability absence is enforced by the configuration;
    // actual native Worker entrypoints remain forbidden here.
    assert(!/(?:request|render|evaluation)-worker\.ts$/.test(path));
    if(!/(?:^|\/)probe\//.test(path))return true;
    const name=path.match(/(?:^|\/)probe\/([^/]+)\.ts$/)?.[1];
    assert(allowed.includes(name));return false;
  });
  if(role!=='operator')assertProductionBoundary(role==='gateway'?'worker':`${role}-worker`,production);
}
