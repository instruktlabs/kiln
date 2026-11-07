import { writeFileSync } from 'node:fs';
import { evaluateEvaluatorRequestV2 } from './handler';
import {
  MAX_EVALUATOR_DEADLINE_MS,
  MAX_EVALUATOR_REQUEST_BYTES,
  MAX_EVALUATOR_RESPONSE_BYTES,
} from './protocol';

async function readBoundedInput(): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_EVALUATOR_REQUEST_BYTES) throw new Error('request limit');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

try {
  // The request carries the GLB limit but neither the response budget nor the deadline. The host
  // stops reading at its own budget and kills this process at its own deadline, which a timer in
  // here could only follow, so the worker bounds both only by what the protocol can ever carry.
  writeFileSync(
    3,
    await evaluateEvaluatorRequestV2(
      await readBoundedInput(),
      {},
      { deadlineMs: MAX_EVALUATOR_DEADLINE_MS, maxResponseBytes: MAX_EVALUATOR_RESPONSE_BYTES },
    ),
    { encoding: 'utf8' },
  );
} catch {
  // Input overflow happens before the handler can classify a request. Passing
  // an invalid empty request through the same handler keeps the result shape
  // canonical and sanitized.
  writeFileSync(3, await evaluateEvaluatorRequestV2(''), { encoding: 'utf8' });
}
