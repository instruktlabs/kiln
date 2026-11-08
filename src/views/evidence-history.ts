import type {
  CurrentViewEvidenceV1,
  DerivativeReviewFidelityV1,
  FaithfulViewEvidenceReferenceV1,
  ViewEvidenceHistoryV1,
  ViewEvidenceSurface,
  ViewFidelityReasonCode,
  ViewFidelityV1,
} from '../composer/render-port';

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 8;

type Fidelity = ViewFidelityV1 | DerivativeReviewFidelityV1;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function cloneReference(
  reference: FaithfulViewEvidenceReferenceV1,
): FaithfulViewEvidenceReferenceV1 {
  return {
    ...reference,
    inputGlbSha256: [...reference.inputGlbSha256],
    rendererIds: [...reference.rendererIds],
  };
}

function currentEvidence(
  sequence: number,
  surface: ViewEvidenceSurface,
  fidelity: Fidelity,
): CurrentViewEvidenceV1 {
  if (fidelity.version === 'kiln.view-fidelity.v1') {
    const valid =
      SHA256.test(fidelity.inputGlbSha256) &&
      fidelity.rendererId.trim().length > 0 &&
      (!fidelity.materialFaithful ||
        (fidelity.delivered === 'full-material' && !fidelity.degraded));
    if (!valid) {
      return {
        sequence,
        surface,
        delivered: 'none',
        materialFaithful: false,
        exactArtifact: false,
        degraded: true,
        inputGlbSha256: [],
        rendererIds: [],
        reasonCodes: ['DERIVATIVE_RECEIPT_INVALID'],
      };
    }
    return {
      sequence,
      surface,
      delivered: fidelity.delivered,
      materialFaithful: fidelity.materialFaithful,
      exactArtifact: fidelity.exactArtifact,
      degraded: fidelity.degraded,
      inputGlbSha256: [fidelity.inputGlbSha256],
      rendererIds: [fidelity.rendererId],
      ...(fidelity.reasonCodes?.length ? { reasonCodes: [...fidelity.reasonCodes] } : {}),
    };
  }

  const valid =
    fidelity.receipts.length > 0 &&
    fidelity.exactArtifact ===
      fidelity.receipts.every((receipt) => receipt.exactArtifact === true) &&
    fidelity.receipts.every(
      (receipt) =>
        typeof receipt.exactArtifact === 'boolean' &&
        receipt.derivativeLabel.trim().length > 0 &&
        receipt.rendererId.trim().length > 0 &&
        SHA256.test(receipt.inputGlbSha256),
    ) &&
    (!fidelity.materialFaithful ||
      (fidelity.delivered === 'full-material' &&
        !fidelity.degraded &&
        fidelity.receipts.every(
          (receipt) =>
            receipt.materialFaithful && receipt.delivered === 'full-material' && !receipt.degraded,
        )));
  if (!valid) {
    return {
      sequence,
      surface,
      delivered: 'none',
      materialFaithful: false,
      exactArtifact: false,
      degraded: true,
      inputGlbSha256: [],
      rendererIds: [],
      reasonCodes: ['DERIVATIVE_RECEIPT_INVALID'],
    };
  }
  const reasonCodes = unique(
    fidelity.receipts
      .flatMap((receipt) => receipt.reasonCodes ?? [])
      .concat(fidelity.reasonCodes ?? []),
  ) as ViewFidelityReasonCode[];
  return {
    sequence,
    surface,
    delivered: fidelity.delivered,
    materialFaithful: fidelity.materialFaithful,
    exactArtifact: fidelity.exactArtifact,
    degraded: fidelity.degraded,
    inputGlbSha256: fidelity.receipts.map((receipt) => receipt.inputGlbSha256),
    rendererIds: unique(fidelity.receipts.map((receipt) => receipt.rendererId)),
    ...(reasonCodes.length ? { reasonCodes } : {}),
  };
}

/** In-memory metadata ledger. It retains hashes/producer ids only, never pixels or source. */
export class ViewEvidenceHistoryStore {
  private readonly limit: number;
  private sequence = 0;
  private current?: CurrentViewEvidenceV1;
  private readonly faithful: FaithfulViewEvidenceReferenceV1[] = [];

  constructor(limit = DEFAULT_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new RangeError(`view evidence history limit must be an integer in [1,${MAX_LIMIT}]`);
    }
    this.limit = limit;
  }

  record(surface: ViewEvidenceSurface, fidelity: Fidelity): ViewEvidenceHistoryV1 {
    this.sequence++;
    this.current = currentEvidence(this.sequence, surface, fidelity);
    if (this.current.materialFaithful) {
      this.faithful.push({
        version: 'kiln.faithful-view-evidence-ref.v1',
        sequence: this.current.sequence,
        surface,
        materialFaithful: true,
        exactArtifact: this.current.exactArtifact,
        inputGlbSha256: [...this.current.inputGlbSha256],
        rendererIds: [...this.current.rendererIds],
      });
      if (this.faithful.length > this.limit)
        this.faithful.splice(0, this.faithful.length - this.limit);
    }
    return this.snapshot()!;
  }

  snapshot(): ViewEvidenceHistoryV1 | undefined {
    if (!this.current) return undefined;
    const faithfulHistory = this.faithful.map(cloneReference);
    return {
      version: 'kiln.view-evidence-history.v1',
      current: {
        ...this.current,
        inputGlbSha256: [...this.current.inputGlbSha256],
        rendererIds: [...this.current.rendererIds],
        ...(this.current.reasonCodes ? { reasonCodes: [...this.current.reasonCodes] } : {}),
      },
      ...(faithfulHistory.length
        ? { lastFaithful: cloneReference(faithfulHistory[faithfulHistory.length - 1]!) }
        : {}),
      faithfulHistory,
    };
  }
}
