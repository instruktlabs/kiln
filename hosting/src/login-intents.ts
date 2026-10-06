import { HttpFailure, sha256 } from './http';

export type SignInProvider = 'google' | 'github';
export interface LoginIntent {
  id: string;
  state: string;
  provider: SignInProvider;
  purpose: 'sign-in';
}

/** Complements browser validation in the OAuth library with atomic replay guards. */
export class D1LoginIntents {
  constructor(
    private readonly database: D1Database,
    private readonly origin: string,
  ) {}
  async claimConsent(handle: string): Promise<void> {
    bounded(handle);
    const now = Date.now();
    const session = this.database.withSession('first-primary');
    const results = await session.batch([
      session
        .prepare(
          'DELETE FROM kiln_consent_claims WHERE handle_hash IN (SELECT handle_hash FROM kiln_consent_claims WHERE expires_at<? LIMIT 128)',
        )
        .bind(now),
      session
        .prepare(
          'INSERT INTO kiln_consent_claims(handle_hash, expires_at) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING handle_hash',
        )
        .bind(await sha256(JSON.stringify([this.origin, handle])), now + 86_400_000),
    ]);
    // Retain the claim much longer than the library's ten-minute transaction.
    // Call only after its browser-cookie validation, so a stranger cannot burn it.
    if (results[1]?.results.length !== 1) throw expired();
  }
  async create(intent: LoginIntent): Promise<void> {
    validate(intent);
    const now = Date.now();
    const session = this.database.withSession('first-primary');
    await session.batch([
      session
        .prepare(
          'DELETE FROM kiln_login_intents WHERE id IN (SELECT id FROM kiln_login_intents WHERE expires_at<? LIMIT 128)',
        )
        .bind(now),
      session
        .prepare(
          'INSERT INTO kiln_login_intents(id, state_hash, provider, purpose, expires_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(
          intent.id,
          await this.stateHash(intent.state),
          intent.provider,
          intent.purpose,
          now + 600_000,
        ),
    ]);
  }
  async consume(intent: LoginIntent): Promise<void> {
    validate(intent);
    const row = await this.database
      .withSession('first-primary')
      .prepare(
        'DELETE FROM kiln_login_intents WHERE id=? AND state_hash=? AND provider=? AND purpose=? AND expires_at>? RETURNING id',
      )
      .bind(
        intent.id,
        await this.stateHash(intent.state),
        intent.provider,
        intent.purpose,
        Date.now(),
      )
      .first();
    if (!row) throw expired();
  }
  private stateHash(state: string): Promise<string> {
    return sha256(JSON.stringify([this.origin, state]));
  }
}

const expired = () => new HttpFailure(400, 'Invalid or expired sign-in; restart sign-in');
function bounded(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 4096) throw expired();
}
function validate(intent: LoginIntent): void {
  if (
    !intent ||
    !/^[a-f0-9-]{36}$/.test(intent.id) ||
    !['google', 'github'].includes(intent.provider) ||
    intent.purpose !== 'sign-in'
  )
    throw expired();
  bounded(intent.state);
}
