import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export const proofStatementSchema = z.object({ id: z.string().uuid(), includesElectricalWork: z.boolean(), membershipId: z.string().uuid(), recordedAt: z.string().datetime({ offset: true }) }).strict();
export const jobProofStatementViewSchema = z.object({ statement: proofStatementSchema.nullable(), requiredEvidenceType: z.enum(["electrical_certificate", "completion_photo"]), stage: z.enum(["electrical-stage", "completion-photo-stage"]), canChange: z.boolean(), blockage: z.string().nullable() }).strict();
export type JobProofStatementView = z.infer<typeof jobProofStatementViewSchema>;
const legacy: JobProofStatementView = { statement: null, requiredEvidenceType: "electrical_certificate", stage: "electrical-stage", canChange: false, blockage: null };
export class JobProofStatementError extends Error {
 constructor(readonly code: "PROOF_SCHEMA_UNAVAILABLE" | "PROOF_SCHEMA_INCONSISTENT" | "FORBIDDEN" | "NOT_FOUND" | "PROOF_STATEMENT_FROZEN" | "INVALID_COMMAND" | "IDEMPOTENCY_CONFLICT") { super(code); }
}

/** Inspect both the installation record and signatures on each transaction. Never cache across upgrades. */
async function installed(db: TenantTransaction): Promise<boolean> {
 const objects = ["app.job_proof_statement", "app.final_account_proof_statement"];
 const signatures = ["app.read_job_proof_statement(uuid,uuid)", "app.answer_job_proof_statement(uuid,jsonb)", "app.job_proof_authority(uuid,boolean)", "app.job_proof_session_digest()", "app.job_proof_requirement(uuid,uuid)", "app.bind_final_account_proof_statement()", "app.guard_job_proof_source()", "app.guard_final_lock_proof_statement()", "app.guard_job_proof_receipt()", "app.validate_job_proof_receipt(uuid,uuid)", "app.require_completed_job_proof_statement()", "app.retire_replaced_job_proof_findings(uuid,uuid)", "app.retired_job_proof_findings(uuid)"];
 const present = (await db.$client.query<{ name: string }>("SELECT name FROM unnest($1::text[]) source(name) WHERE pg_catalog.to_regclass(name) IS NOT NULL", [objects])).rows;
 const routines = (await db.$client.query<{ name: string }>("SELECT name FROM unnest($1::text[]) source(name) WHERE pg_catalog.to_regprocedure(name) IS NOT NULL", [signatures])).rows;
 const ledger = (await db.$client.query<{ name: string }>("SELECT name FROM unnest(ARRAY['public.jobguard_schema_migration']) source(name) WHERE pg_catalog.to_regclass(name) IS NOT NULL AND pg_catalog.has_column_privilege(name,'migration_name','SELECT')")).rows;
 const recorded = ledger.length ? (await db.$client.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", ["0943_job_proof_statement.sql"])).rowCount !== 0 : false;
 if (!recorded && !present.length && !routines.length) return false;
 if (!recorded || present.length !== objects.length || routines.length !== signatures.length) throw new JobProofStatementError("PROOF_SCHEMA_INCONSISTENT");
 return true;
}

/** A missing statement preserves the certificate requirement without recording an answer. */
export async function readJobProofStatement(db: TenantTransaction, jobId: string, revisionId?: string): Promise<JobProofStatementView> {
 if (!await installed(db)) return { ...legacy };
 const result = (await db.$client.query<{ result: unknown }>("SELECT app.job_proof_requirement($1,$2) result", [jobId, revisionId ?? null])).rows[0]?.result;
 const parsed = jobProofStatementViewSchema.safeParse(result);
 if (!parsed.success) throw new JobProofStatementError("PROOF_SCHEMA_INCONSISTENT");
 const view = parsed.data, no = view.statement?.includesElectricalWork === false;
 if (view.requiredEvidenceType !== (no ? "completion_photo" : "electrical_certificate") || view.stage !== (no ? "completion-photo-stage" : "electrical-stage")) throw new JobProofStatementError("PROOF_SCHEMA_INCONSISTENT");
 return view;
}

/** Serialization only: the private credential bridge is exclusive to statement reads/writes. */
export async function lockJobProofAuthority(db: TenantTransaction, jobId: string): Promise<void> {
 if (!await installed(db)) return;
 await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=current_setting('app.tenant_id')::uuid AND id=$1 FOR UPDATE", [jobId]);
}

export class JobProofStatementService {
 constructor(private readonly pool: Pool) {}
 async answer(context: VerifiedTenantContext, jobId: string, raw: unknown) {
  const parsed = z.object({ version: z.literal("practice-proof-command.v1"), action: z.literal("answer_statement"), commandId: z.string().uuid(), includesElectricalWork: z.boolean() }).strict().safeParse(raw);
  if (!parsed.success || !z.string().uuid().safeParse(jobId).success) throw new JobProofStatementError("INVALID_COMMAND");
  return withTenant(this.pool, context, async db => {
   if (!await installed(db)) throw new JobProofStatementError("PROOF_SCHEMA_UNAVAILABLE");
   const result = (await db.$client.query<{ result: unknown }>("SELECT app.answer_job_proof_statement($1,$2::jsonb) result", [jobId, JSON.stringify(parsed.data)])).rows[0]?.result;
   return z.object({ version: z.literal("practice-proof-statement-result.v1"), jobId: z.string().uuid(), statement: proofStatementSchema }).strict().parse(result);
  }).catch((error: unknown) => {
   const message = error instanceof Error ? error.message : "";
   if (["FORBIDDEN", "NOT_FOUND", "PROOF_STATEMENT_FROZEN", "INVALID_COMMAND", "IDEMPOTENCY_CONFLICT"].includes(message)) throw new JobProofStatementError(message as JobProofStatementError["code"]);
   throw error;
  });
 }
}
