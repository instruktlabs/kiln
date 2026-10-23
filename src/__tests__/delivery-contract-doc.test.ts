import { expect, test } from 'bun:test';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

// #199: every delivery finding the inspector can emit has a row in the contract's
// findings table, so its check, tolerance and disposition are written down.
test('docs/delivery-contract.md explains every delivery finding code', async () => {
  const source = await read('../delivery-inspect.ts');
  const emitted = [
    ...new Set(source.match(/'DELIVERY_[A-Z_]+'/g)!.map((code) => code.slice(1, -1))),
  ];
  expect(emitted.length).toBeGreaterThan(0);
  const doc = await read('../../docs/delivery-contract.md');
  const section = doc.split('### Delivery findings')[1]?.split('\n## ')[0] ?? '';
  const rows = new Map(
    section
      .split('\n')
      .filter((line) => line.startsWith('| `DELIVERY_'))
      .map((line) => [line.match(/`(DELIVERY_[A-Z_]+)`/)![1]!, line] as const),
  );
  expect([...rows.keys()].sort()).toEqual(emitted.sort());
  for (const row of rows.values()) expect(row).toContain('Advisory');
});
