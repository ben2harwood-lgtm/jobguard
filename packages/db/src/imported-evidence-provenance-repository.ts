import type { Pool } from "pg";
import type { ImportedBaselineReadScope } from "./imported-baseline-sources.js";
import { readImportedObservationBundle } from "./imported-observation-reader.js";

/**
 * DEPENDENCY-BOUND: P installs no history writer/completion ledger and B no source
 * map. These entrypoints cannot adopt or return provenance. No dispatcher receipt
 * or approval is created for an unavailable capability. This is not HistoryImportPort.
 */
export class ImportedEvidenceProvenanceRepository {
  constructor(private readonly pool: Pool) {}

  async adoptWithHistory(scope: ImportedBaselineReadScope, sourceJobId: string, _command: unknown): Promise<never> {
    return readImportedObservationBundle(this.pool, scope, sourceJobId);
  }

  async read(scope: ImportedBaselineReadScope, jobId: string): Promise<never> {
    return readImportedObservationBundle(this.pool, scope, jobId);
  }
}
