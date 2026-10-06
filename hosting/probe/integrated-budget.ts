export const integratedBudget = { coordinator: 9, evaluation: 4, render: 4 } as const;
export type IntegratedKind = keyof typeof integratedBudget;
interface BudgetRecord {
  state: 'open' | 'closed';
  claims: { kind: IntegratedKind; id: string }[];
}
/** Diagnostic-only ceiling. It cannot reset, refund a failed start or resume a prior batch. */
export class IntegratedBudget {
  constructor(private readonly storage: DurableObjectStorage) {}
  open(): Promise<void> {
    return this.storage.transaction(async (tx) => {
      if (await tx.get('budget')) throw new Error('TRIAL_ALREADY_USED');
      await tx.put('budget', { state: 'open', claims: [] } satisfies BudgetRecord);
    });
  }
  claim(kind: IntegratedKind, id: string): Promise<void> {
    return this.storage.transaction(async (tx) => {
      const record = await tx.get<BudgetRecord>('budget');
      if (
        record?.state !== 'open' ||
        !Object.hasOwn(integratedBudget, kind) ||
        !/^[a-f0-9]{64}$/.test(id) ||
        record.claims.some((claim) => claim.kind === kind && claim.id === id) ||
        record.claims.filter((claim) => claim.kind === kind).length >= integratedBudget[kind]
      )
        throw new Error('TRIAL_BUDGET_DENIED');
      record.claims.push({ kind, id });
      await tx.put('budget', record);
    });
  }
  close(): Promise<void> {
    return this.storage.transaction(async (tx) => {
      const record = await tx.get<BudgetRecord>('budget');
      await tx.put('budget', { ...record, state: 'closed', claims: record?.claims ?? [] });
    });
  }
  status(): Promise<BudgetRecord | undefined> {
    return this.storage.get('budget');
  }
}
