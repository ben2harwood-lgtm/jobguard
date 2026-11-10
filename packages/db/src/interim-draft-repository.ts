import type { Pool } from "pg";
import { z } from "zod";
import {
  appendInterimDraftRecord, reconcileInterimDraftBook, interimRecordV1,
  INTERIM_APPLICATION_WATERMARK, InterimApplicationError, type InterimDraftBook,
} from "@jobguard/core";
import { canonicalJson, sha256Hex } from "./work-order-repository.js";
import { withTenant, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";
import { RequestBindingRefusedError } from "./request-binding-error.js";

const id = z.guid().transform(value => value.toLowerCase());
const commandV1 = z.object({ version: z.literal("interim.persist-command.v1"), commandId: id,
  jobId: id, record: z.record(z.string(), z.unknown()),
}).strict();
const storedV1 = z.object({ commandId: id, actorId: id, revision: z.number().int().positive(),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/u), record: interimRecordV1,
  watermark: z.literal(INTERIM_APPLICATION_WATERMARK), lineage: z.literal("fixture_lineage_not_authority"),
}).strict();
const hash = (value: unknown) => sha256Hex(canonicalJson(value));
export class InterimDraftRepositoryError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" | "DARK" | "FORBIDDEN" | "UNAUTHENTICATED" | "JOB_NOT_LIVE") {
    super(`INTERIM_DRAFT_${code}`); this.name = "InterimDraftRepositoryError";
  }
}
function invalid(): never { throw new InterimDraftRepositoryError("INVALID_INPUT"); }

/** Dark synthetic storage only. actor is a verified-session token digest supplied by
 * the authentication caller, never a membership/tenant/authority field in raw input. */
export class InterimDraftRepository {
  constructor(private readonly pool: Pool) {}
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (error instanceof InterimApplicationError || error instanceof InterimDraftRepositoryError) throw error;
      // A revoked or mismatched bound session is a permission refusal, never a retryable outage.
      if (error instanceof RequestBindingRefusedError) throw new InterimDraftRepositoryError("FORBIDDEN");
      const message = error instanceof Error ? error.message : "";
      if (message === "METER_FORBIDDEN" || (error instanceof Error && "code" in error && error.code === "42501" && message === "REQUEST_BINDING_REFUSED")) throw new InterimDraftRepositoryError("FORBIDDEN");
      if (message === "JOB_NOT_LIVE") throw new InterimDraftRepositoryError("JOB_NOT_LIVE");
      for (const code of ["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "DARK", "FORBIDDEN", "UNAUTHENTICATED"] as const) {
        if (message === `INTERIM_DRAFT_${code}`) throw new InterimDraftRepositoryError(code);
      }
      throw new InterimDraftRepositoryError("UNAVAILABLE");
    }
  }
  private async load(db: TenantTransaction, context: VerifiedTenantContext, jobId: string, actor: string | null) {
    const result: unknown = (await db.$client.query(
      "SELECT app.interim_draft_records($1,$2,$3,'read',$4::jsonb) result",
      [context.tenantId, actor, jobId, "{}"])).rows[0]?.result;
    const rows = z.array(storedV1).max(10000).parse(result);
    const book: InterimDraftBook = { version: "interim.draft-book.v1", environment: "synthetic",
      tenantId: context.tenantId, jobId, records: rows.map((row, index) => {
        if (row.revision !== index + 1 || hash(row.record) !== row.recordHash) throw new InterimDraftRepositoryError("UNAVAILABLE");
        return row.record;
      }) };
    return { watermark: INTERIM_APPLICATION_WATERMARK, lineage: "fixture_lineage_not_authority" as const,
      rows, book, reconciliation: reconcileInterimDraftBook(book) };
  }
  async read(context: VerifiedTenantContext, jobId: string, actor: string | null = null) {
    const parsed = id.safeParse(jobId); if (!parsed.success) invalid();
    return this.guarded(() => withTenant(this.pool, context, db => this.load(db, context, parsed.data, actor)));
  }
  async command(context: VerifiedTenantContext, actor: string, raw: unknown) {
    const parsed = commandV1.safeParse(raw);
    if (!parsed.success || !/^[a-f0-9]{64}$/u.test(actor)) invalid();
    const input = parsed.data;
    if ("tenantId" in input.record || "jobId" in input.record) invalid();
    const record = interimRecordV1.safeParse({ ...input.record, tenantId: context.tenantId, jobId: input.jobId });
    if (!record.success) invalid();
    return this.guarded(() => withTenant(this.pool, context, async db => {
      // The read routine holds the same job advisory lock until this transaction ends.
      const current = await this.load(db, context, input.jobId, actor);
      const recordHash = hash(record.data);
      const prior = current.rows.find(row => row.commandId === input.commandId);
      if (prior) {
        if (prior.recordHash !== recordHash) throw new InterimDraftRepositoryError("CONFLICT");
        // SQL rechecks the authenticated actor as well as payload on every replay.
      } else {
        const next = appendInterimDraftRecord(current.book, record.data);
        if (next.records.length !== current.book.records.length + 1) throw new InterimDraftRepositoryError("CONFLICT");
      }
      await db.$client.query("SELECT app.interim_draft_records($1,$2,$3,'append',$4::jsonb) result",
        [context.tenantId, actor, input.jobId, JSON.stringify({ commandId: input.commandId,
          expectedRevision: current.rows.length, record: record.data, recordHash })]);
      return this.load(db, context, input.jobId, actor);
    }));
  }
}
