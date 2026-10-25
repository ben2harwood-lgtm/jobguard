import type { Pool } from "pg";
import type { VerifiedTenantContext } from "./tenant-context.js";
import { readImportedObservationBundle } from "./imported-observation-reader.js";

/**
 * DEPENDENCY-BOUND: P installs no history writer/completion ledger and B no source
 * map. These entrypoints cannot adopt or return provenance. No dispatcher receipt
 * or approval is created for an unavailable capability. This is not HistoryImportPort.
 */
export class ImportedEvidenceProvenanceRepository {
  constructor(private readonly pool: Pool) {}

  async adoptWithHistory(context: VerifiedTenantContext, digest: string, sourceJobId: string, _command: unknown): Promise<never> {
    return readImportedObservationBundle(this.pool, { context, sessionDigest: digest }, sourceJobId);
  }

  async read(context: VerifiedTenantContext, digest: string, jobId: string): Promise<never> {
    return readImportedObservationBundle(this.pool, { context, sessionDigest: digest }, jobId);
  }
}
