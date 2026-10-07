import { deploymentConfig } from './deployment-config.mjs';

// Derive the same gateway identity and recovery bindings. Preparation is offline;
// existing resources and live routes must be read back before a code-only change.
export function maintenanceConfig(manifest) {
  const base = deploymentConfig(manifest);
  const wrangler = base.wrangler.gateway;
  delete wrangler.d1_databases[0].migrations_dir;
  return {
    root: base.root,
    monitoring: base.monitoring,
    workers: { gateway: base.workers.gateway },
    wrangler: { gateway: wrangler },
    containers: {},
    entries: { gateway: 'maintenance-worker' },
    deployOrder: ['gateway'],
  };
}
