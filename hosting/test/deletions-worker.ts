import { D1AccountDeletions } from '../src/account-deletions';
import { serviceFailure } from '../src/http';
import type { BrowserSession } from '../src/browser-sessions';
import type { VerifiedIdentity } from '../src/accounts';

// This synthetic interface supplies verified proofs only for local tests. It is
// not a production route, credential issuer or native execution qualification.
export default {
  async fetch(
    request: Request,
    env: { ACCOUNTS: D1Database },
    ctx: ExecutionContext,
  ): Promise<Response> {
    const database = env.ACCOUNTS;
    const ports = {
      async retireCompute(account: string) {
        await database
          .prepare("INSERT INTO fixture_calls VALUES ('compute',?)")
          .bind(account)
          .run();
        if (await database.prepare("SELECT 1 FROM fixture_faults WHERE name='compute'").first())
          throw new Error('Injected compute cleanup');
        if (
          await database.prepare("SELECT 1 FROM fixture_faults WHERE name='held-compute'").first()
        ) {
          const pending = new Promise<void>((resolve) => setTimeout(resolve, 20_200)).then(
            async () => {
              await database
                .prepare("INSERT INTO fixture_calls VALUES ('compute-returned',?)")
                .bind(account)
                .run();
            },
          );
          // Keep the originating request alive so this fixture proves a real
          // late completion, not just workerd cancelling an abandoned promise.
          ctx.waitUntil(pending);
          await pending;
        }
        if (
          await database.prepare("SELECT 1 FROM fixture_faults WHERE name='lease-takeover'").first()
        )
          await database
            .prepare("UPDATE kiln_deletions SET lease_token='replacement' WHERE account_id=?")
            .bind(account)
            .run();
      },
      async retireStorage(account: string) {
        await database
          .prepare("INSERT INTO fixture_calls VALUES ('storage',?)")
          .bind(account)
          .run();
        if (
          await database.prepare("SELECT 1 FROM fixture_faults WHERE name='storage-error'").first()
        )
          throw new Error('Injected storage failure');
        return !(await database
          .prepare("SELECT 1 FROM fixture_faults WHERE name='storage-pending'")
          .first());
      },
      async revokeGrants(account: string) {
        await database.prepare("INSERT INTO fixture_calls VALUES ('grants',?)").bind(account).run();
        return !(await database
          .prepare("SELECT 1 FROM fixture_faults WHERE name='grants-pending'")
          .first());
      },
    };
    try {
      const now = Number(request.headers.get('x-fixture-now')) || Date.now();
      const jobs = new D1AccountDeletions(database, 'https://kiln.example.com', ports, () => now);
      const path = new URL(request.url).pathname;
      if (path === '/request') {
        const value = (await request.json()) as {
          proof: BrowserSession;
          identity: VerifiedIdentity;
          receipt: string;
        };
        return Response.json(await jobs.request(value.proof, value.identity, value.receipt));
      }
      if (path === '/recover') return Response.json(await jobs.recover());
      if (path === '/status')
        return Response.json(await jobs.status(request.headers.get('x-fixture-receipt')));
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return serviceFailure(error);
    }
  },
};
