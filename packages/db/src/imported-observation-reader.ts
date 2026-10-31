import type { Pool } from "pg";
import { readImportedBaselineSources, type ImportedBaselineReadScope } from "./imported-baseline-sources.js";

export class ImportedEvidenceSourceError extends Error {
  constructor(readonly code: "IMPORT_HISTORY_SOURCE_HANDOFF_HELD") {
    super(code);
    this.name = "ImportedEvidenceSourceError";
  }
}

/** Internal boundary only. There is no accepted ImportedObservationBundleV1 yet. */
export async function readImportedObservationBundle(
  db: Pool, scope: ImportedBaselineReadScope, jobId: string,
): Promise<never> {
  // Reuse B's current session/tenant/job checks; never catch or mask their denial.
  await readImportedBaselineSources(db, scope, jobId, undefined);
  // If B later becomes available, that alone must not activate historical sources.
  throw new ImportedEvidenceSourceError("IMPORT_HISTORY_SOURCE_HANDOFF_HELD");
}
