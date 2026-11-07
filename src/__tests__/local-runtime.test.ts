import { expect, it } from 'bun:test';
import { createLocalToolContext } from '../local-runtime';

it('defaults local tools to terminable evaluation and reports trusted overrides honestly', async () => {
  const local = createLocalToolContext({}, { KILN_EVALUATOR_TIMEOUT_MS: '100' });
  expect(local.localExecution.mode).toBe('subprocess');
  expect(local.localExecution.terminable).toBe(true);
  await expect(
    local.evaluatorPort!.render('function build(){while(true){}}'),
  ).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
  const trusted = createLocalToolContext({}, { KILN_EVALUATOR_MODE: 'in-process' });
  expect(trusted.localExecution.terminable).toBe(false);
  expect(trusted.localExecution.deadlineMs).toBeUndefined();
});

it('rejects unsupported policy and limit overrides instead of silently ignoring them', () => {
  expect(() => createLocalToolContext({}, { KILN_QA_MODE: 'off' })).toThrow('KILN_QA_MODE');
  expect(() => createLocalToolContext({}, { KILN_EVALUATOR_TIMEOUT_MS: '-1' })).toThrow(
    'KILN_EVALUATOR_TIMEOUT_MS',
  );
  expect(() => createLocalToolContext({}, { KILN_EVALUATOR_MODE: 'subproces' })).toThrow(
    'KILN_EVALUATOR_MODE',
  );
});

it('takes the documented deadline range and keeps the 60-second default', () => {
  expect(createLocalToolContext({}, {}).localExecution.deadlineMs).toBe(60_000);
  expect(
    createLocalToolContext({}, { KILN_EVALUATOR_TIMEOUT_MS: '120000' }).localExecution.deadlineMs,
  ).toBe(120_000);
  expect(() => createLocalToolContext({}, { KILN_EVALUATOR_TIMEOUT_MS: '120001' })).toThrow(
    'KILN_EVALUATOR_TIMEOUT_MS',
  );
});

it('keeps cancellation out of source and cached results', async () => {
  const controller = new AbortController();
  controller.abort();
  const local = createLocalToolContext({}, {});
  await expect(
    local.evaluatorPort!.render('function build(){}', {}, { signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'CANCELLED' });
});
