import type { ShadowProposal } from "@jobguard/core";

export class ImportedShadowSourceError extends Error {
  constructor(readonly code: "IMPORT_HISTORY_SOURCE_HANDOFF_HELD") {
    super(code);
    this.name = "ImportedShadowSourceError";
  }
}

/**
 * DEPENDENCY-BOUND. No accepted stored provenance/bundle or sink recheck exists.
 * Never let a caller's classification promote deterministic OR model proposals.
 * No worker composition is installed by this leaf; v1 continues on its own path.
 */
export function applyImportedProvenance(_proposals: readonly ShadowProposal[], _storedProvenance: unknown): never {
  throw new ImportedShadowSourceError("IMPORT_HISTORY_SOURCE_HANDOFF_HELD");
}
