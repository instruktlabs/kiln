export const lifecycleBudget = { coordinator: 14, evaluation: 4, render: 4 } as const;
export type LifecycleKind = keyof typeof lifecycleBudget;
interface BudgetRecord {
  state: 'open' | 'closed';
  claims: { kind: LifecycleKind; id: string }[];
}
/** Private diagnostic ceiling. Failed starts consume their claim permanently. */
export class LifecycleBudget {
  constructor(private readonly storage: DurableObjectStorage) {}
  open(): Promise<void> {
    return this.storage.transaction(async (tx) => {
      if (await tx.get('lifecycle-allowance-v1')) throw new Error('LIFECYCLE_ALREADY_USED');
      await tx.put('lifecycle-allowance-v1', { state: 'open', claims: [] } satisfies BudgetRecord);
    });
  }
  claim(kind: LifecycleKind, id: string): Promise<void> {
    return this.storage.transaction(async (tx) => {
      const record = await tx.get<BudgetRecord>('lifecycle-allowance-v1');
      if (
        record?.state !== 'open' ||
        !Object.hasOwn(lifecycleBudget, kind) ||
        !/^[a-f0-9]{64}(?![\s\S])/.test(id) ||
        record.claims.some((claim) => claim.kind === kind && claim.id === id) ||
        record.claims.filter((claim) => claim.kind === kind).length >= lifecycleBudget[kind]
      )
        throw new Error('LIFECYCLE_BUDGET_DENIED');
      record.claims.push({ kind, id });
      await tx.put('lifecycle-allowance-v1', record);
    });
  }
  close(): Promise<void> {
    return this.storage.transaction(async (tx) => {
      const record = await tx.get<BudgetRecord>('lifecycle-allowance-v1');
      await tx.put('lifecycle-allowance-v1', { state: 'closed', claims: record?.claims ?? [] });
    });
  }
  status(): Promise<BudgetRecord | undefined> {
    return this.storage.get('lifecycle-allowance-v1');
  }
}
