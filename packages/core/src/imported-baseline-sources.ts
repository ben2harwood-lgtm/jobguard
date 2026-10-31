/**
 * CH5-P c6c4ec97 installs no persisted v3 baseline/terms reader contract.
 * Keep the missing capability explicit; these are not successful projections.
 * Do not freeze a speculative ImportedFinalAccountBaselineV1 here.
 */
export const importedBaselineSourceHold = Object.freeze({
  version: "imported-baseline-source-availability.v1" as const,
  status: "held" as const,
  code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" as const,
  environment: "synthetic_demo" as const,
  realExternalActions: 0 as const,
});

export class ImportedBaselineSourceError extends Error {
  constructor(readonly code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" | "FORBIDDEN" | "INVALID_SOURCE_SCOPE" | "SYNTHETIC_MODE_REQUIRED") {
    super(code);
    this.name = "ImportedBaselineSourceError";
  }
}

export function requireImportedBaselineSource(): never {
  throw new ImportedBaselineSourceError(importedBaselineSourceHold.code);
}

/** No accepted immutable source DTO exists yet. Never turn a preview into capture authority. */
export function toImportedShadowCaptures(_snapshot: unknown): never {
  return requireImportedBaselineSource();
}

/** No accepted imported activation discriminator/plan context exists yet. */
export function toImportedActivationSource(_snapshot: unknown): never {
  return requireImportedBaselineSource();
}
