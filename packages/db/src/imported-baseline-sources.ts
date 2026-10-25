import type { Pool } from "pg";
import { z } from "zod";
import { ImportedBaselineSourceError, requireImportedBaselineSource } from "../../core/dist/imported-baseline-sources.js";
import { practiceOwnedJobsSql } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** Internal request scope; original verified context is passed through without copying. */
export interface ImportedBaselineReadScope {
  readonly context: VerifiedTenantContext;
  readonly sessionDigest: string;
}
const scopeInputV1 = z.object({
  version: z.literal("imported-baseline-read-scope.v1"),
  sessionDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  jobId: z.string().uuid().transform(value => value.toLowerCase()),
}).strict();

/**
 * Fresh session and job authority precede the capability hold on EVERY call.
 * expectedBaselineRef remains opaque until the owners return the accepted DTO.
 * No preview, legacy baseline, mutable parties or hidden output is a fallback.
 */
export async function readImportedBaselineSources(
  db: Pool, scope: ImportedBaselineReadScope, jobId: string, _expectedBaselineRef: unknown,
): Promise<never> {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ImportedBaselineSourceError("SYNTHETIC_MODE_REQUIRED");
  const parsed = scopeInputV1.safeParse({ version: "imported-baseline-read-scope.v1", sessionDigest: scope.sessionDigest, jobId });
  if (!parsed.success) throw new ImportedBaselineSourceError("INVALID_SOURCE_SCOPE");
  return withTenant(db, scope.context, async transaction => {
    const { sessionDigest, jobId: scopedJobId } = parsed.data;
    const principal = await transaction.$client.query(
      "SELECT membership_id FROM app.authenticate_practice_session($1,$2)", [sessionDigest, scope.context.tenantId],
    );
    if (!principal.rowCount) throw new ImportedBaselineSourceError("FORBIDDEN");
    const owned = await transaction.$client.query(
      `${practiceOwnedJobsSql()} SELECT id FROM practice_owned_job WHERE id=$2`,
      [scope.context.tenantId, scopedJobId, sessionDigest],
    );
    if (!owned.rowCount) throw new ImportedBaselineSourceError("FORBIDDEN");
    return requireImportedBaselineSource();
  });
}
