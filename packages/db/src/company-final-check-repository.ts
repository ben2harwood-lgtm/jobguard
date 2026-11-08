import type { Pool } from "pg";
import { z } from "zod";
import { FINAL_ACCOUNT_DECLARATION_VERSION, FINAL_CHECK_TERMS_VERSION } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.guid();
const jobV1 = z.object({ version: z.literal("company-final-check.v1"), jobId: uuid }).strict();
const termsV1 = jobV1.extend({ commandId: uuid, termsVersion: z.literal(FINAL_CHECK_TERMS_VERSION) }).strict();
const dispositionV1 = jobV1.extend({ commandId: uuid, scopeItemId: uuid, disposition: z.enum(["done", "removed", "deferred"]) }).strict();
const lockV1 = jobV1.extend({ commandId: uuid, finalAccountRevisionId: uuid,
  expectedRevision: z.number().int().nonnegative().safe(), declarationVersion: z.literal(FINAL_ACCOUNT_DECLARATION_VERSION) }).strict();
const resultV1 = z.record(z.string(), z.unknown());

export class CompanyFinalCheckError extends Error {
  constructor(readonly code: string) { super(code); this.name = "CompanyFinalCheckError"; }
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new CompanyFinalCheckError("INVALID_COMPANY_FINAL_CHECK_INPUT");
  return parsed.data;
}

/** Dark slice 1. SQL derives identity solely from the session-bearing withTenant binding. */
export class CompanyFinalCheckRepository {
  constructor(private readonly pool: Pool) {}
  private async call(context: VerifiedTenantContext, sql: string, values: readonly unknown[]) {
    try {
      return await withTenant(this.pool, context, async db => {
        await db.$client.query("SET LOCAL lock_timeout='5s'");
        return resultV1.parse((await db.$client.query<{ result: unknown }>(sql, [...values])).rows[0]?.result);
      });
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e.code === "42501") throw new CompanyFinalCheckError("COMPANY_FINAL_CHECK_FORBIDDEN");
      if (e.code === "55P03") throw new CompanyFinalCheckError("FINAL_ACCOUNT_LOCK_BUSY");
      if (e.message === "IDEMPOTENCY_PAYLOAD_CONFLICT") throw new CompanyFinalCheckError("IDEMPOTENCY_CONFLICT");
      if (e.message && ["FINAL_ACCOUNT_LOCK_REQUIRED", "DISCLOSURE_TERMS_NOT_ACCEPTED", "FINAL_ACCOUNT_ALREADY_LOCKED",
        "STALE_OR_BLOCKED_FINAL_ACCOUNT", "SCOPE_DISPOSITION_MISSING", "FINAL_ACCOUNT_UPLOADS_IN_PROGRESS",
        "FINAL_REVIEW_CLOSED", "INVALID_FINAL_ACCOUNT_LOCK_INPUT", "SCOPE_ITEM_NOT_BASELINE"].includes(e.message)) {
        throw new CompanyFinalCheckError(e.message);
      }
      throw error;
    }
  }
  async read(context: VerifiedTenantContext, raw: unknown) {
    const c = parse(jobV1, raw);
    return this.call(context, "SELECT app.company_final_check_read($1) result", [c.jobId]);
  }
  async acceptTerms(context: VerifiedTenantContext, raw: unknown) {
    const c = parse(termsV1, raw);
    return this.call(context, "SELECT app.company_final_check_terms($1,$2,$3) result", [c.jobId, c.commandId, c.termsVersion]);
  }
  async disposition(context: VerifiedTenantContext, raw: unknown) {
    const c = parse(dispositionV1, raw);
    return this.call(context, "SELECT app.company_final_check_disposition($1,$2,$3,$4) result", [c.jobId, c.commandId, c.scopeItemId, c.disposition]);
  }
  async lock(context: VerifiedTenantContext, raw: unknown) {
    const c = parse(lockV1, raw);
    return this.call(context, "SELECT app.company_final_check_lock($1,$2,$3,$4,$5) result",
      [c.jobId, c.commandId, c.finalAccountRevisionId, c.expectedRevision, c.declarationVersion]);
  }
  async requestRun(context: VerifiedTenantContext, raw: unknown) {
    const c = parse(jobV1, raw);
    return this.call(context, "SELECT app.company_final_check_request_run($1) result", [c.jobId]);
  }
  async reveal(context: VerifiedTenantContext, raw: unknown) {
    const c = parse(jobV1, raw);
    return this.call(context, "SELECT app.company_final_check_reveal($1) result", [c.jobId]);
  }
}
