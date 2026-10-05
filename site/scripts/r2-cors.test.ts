import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('the Wrangler R2 CORS policy permits public asset reads and range requests, without writes', async () => {
  // Cloudflare's Wrangler/API schema uses lower-camel rules/allowed fields, not S3's uppercase array form.
  // https://developers.cloudflare.com/r2/buckets/cors/#add-cors-policies-via-wrangler-cli
  const policy = JSON.parse(await readFile(new URL('../r2-cors.json', import.meta.url), 'utf8'));
  expect(Object.keys(policy)).toEqual(['rules']);
  expect(policy.rules).toHaveLength(1);
  const rule = policy.rules[0];
  expect(Object.keys(rule).sort()).toEqual(['allowed', 'exposeHeaders', 'maxAgeSeconds']);
  expect(Object.keys(rule.allowed).sort()).toEqual(['headers', 'methods', 'origins']);
  expect(rule.allowed.origins).toEqual(['*']);
  expect([...rule.allowed.methods].sort()).toEqual(['GET', 'HEAD']);
  expect(rule.allowed.headers).toEqual(['Range']);
  expect([...rule.exposeHeaders].sort()).toEqual(['Content-Length', 'ETag']);
  expect(rule.maxAgeSeconds).toBe(3600);
});
