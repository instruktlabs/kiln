import { IDENTITY_ISSUERS, type VerifiedIdentity } from './accounts';
import { HttpFailure, readBounded, sha256 } from './http';

export interface GitHubEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

async function upstreamJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new HttpFailure(502, 'Sign-in provider unavailable; restart sign-in');
  }
  const value: unknown = JSON.parse(
    new TextDecoder().decode(await readBounded(response.body, 32_768)),
  );
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpFailure(502, 'Invalid sign-in response');
  return value as Record<string, unknown>;
}

export async function githubIdentity(
  code: string,
  verifier: string,
  origin: string,
  env: GitHubEnv,
): Promise<VerifiedIdentity> {
  const token = await upstreamJson('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      redirect_uri: `${origin}/oauth/github/callback`,
    }),
  });
  if (
    typeof token.access_token !== 'string' ||
    !token.access_token ||
    token.access_token.length > 4096 ||
    typeof token.token_type !== 'string' ||
    token.token_type.toLowerCase() !== 'bearer'
  ) {
    throw new HttpFailure(400, 'Sign-in failed; restart sign-in');
  }
  const user = await upstreamJson('https://api.github.com/user', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token.access_token}`,
      'user-agent': 'Kiln-Instrukt-Labs',
      'x-github-api-version': '2026-03-10',
    },
  });
  if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new HttpFailure(502, 'Invalid sign-in identity');
  }
  // Immutable provider id, never a mutable login or email. Upstream tokens are
  // discarded here; the account directory owns the provider-neutral subject.
  return { issuer: IDENTITY_ISSUERS.github, subject: String(user.id) };
}

export async function githubAuthorizationUrl(
  origin: string,
  state: string,
  verifier: string,
  env: GitHubEnv,
  selectAccount = false,
): Promise<string> {
  const target = new URL('https://github.com/login/oauth/authorize');
  target.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${origin}/oauth/github/callback`,
    scope: '',
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256',
    ...(selectAccount ? { prompt: 'select_account' } : {}),
  }).toString();
  return target.href;
}
