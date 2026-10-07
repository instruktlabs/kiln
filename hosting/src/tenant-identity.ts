import { HttpFailure, sha256 } from './http';

/** Only a verified MCP grant or current primary browser session may supply userId. */
export function tenantForAccount(origin: string, userId: string): Promise<string> {
  if (typeof userId !== 'string' || !/^ka_[a-f0-9]{32}(?![\s\S])/.test(userId))
    throw new HttpFailure(401, 'Invalid identity');
  return sha256(JSON.stringify(['kiln-tenant-v1', origin, userId]));
}
