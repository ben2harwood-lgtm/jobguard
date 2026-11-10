import { isRequestBindingRefusal } from "./request-binding-error.js";
import type { Pool } from "pg";
import { z } from "zod";
import {
  vatTreatmentFixtureBookV1, reconcileVatTreatmentFixtures, VatTreatmentError,
  VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION,
} from "@jobguard/core";
import { withTenant, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";

const id = z.guid().transform(value => value.toLowerCase());
const header = vatTreatmentFixtureBookV1.omit({ tenantId: true, jobId: true, documents: true });
const append = z.object({ version: z.literal("vat.fixture-append.v1"), commandId: id, jobId: id,
  book: header, document: vatTreatmentFixtureBookV1.shape.documents.element }).strict();
const record = z.object({ input: append, actorId: id, recordHash: z.string().regex(/^[a-f0-9]{64}$/u),
  matrixVersion: z.literal(VAT_SUPPORT_MATRIX_VERSION), environment: z.literal("synthetic"),
  label: z.literal(VAT_FIXTURE_LABEL) }).strict();
export class VatFixtureRepositoryError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE" | "DISABLED") {
    super(`VAT_FIXTURE_${code}`); this.name = "VatFixtureRepositoryError";
  }
}

/** Dark synthetic storage only. actor is a trusted membership ID, never request input.
 * Eligibility actor/evidence IDs and interim/retention IDs remain fictional lineage.
 * No command dispatcher, invoice, tax policy, provider or issue authority is created. */
export class VatFixtureRepository {
  constructor(private readonly pool: Pool) {}
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (isRequestBindingRefusal(error)) throw new VatFixtureRepositoryError("FORBIDDEN");
      if (error instanceof VatFixtureRepositoryError || error instanceof VatTreatmentError) throw error;
      const code = error instanceof Error ? error.message : "";
      for (const kind of ["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "DISABLED"] as const) {
        if (code === `VAT_FIXTURE_${kind}`) throw new VatFixtureRepositoryError(kind);
      }
      throw new VatFixtureRepositoryError("UNAVAILABLE");
    }
  }
  private async rows(db: TenantTransaction, context: VerifiedTenantContext, jobId: string,
    actor: string | null, operation: "read" | "lock" | "append", input: unknown = {}) {
    const raw: unknown = (await db.$client.query(
      "SELECT app.vat_fixture_records($1,$2,$3,$4,$5::jsonb) result",
      [context.tenantId, actor, jobId, operation, JSON.stringify(input)],
    )).rows[0]?.result;
    const parsed = z.array(record).safeParse(raw);
    if (!parsed.success) throw new VatFixtureRepositoryError("UNAVAILABLE");
    return parsed.data;
  }
  private project(context: VerifiedTenantContext, jobId: string, records: z.infer<typeof record>[]) {
    if (!records.length) throw new VatFixtureRepositoryError("NOT_FOUND");
    const first = records[0]!.input.book;
    if (records.some(row => row.input.jobId !== jobId || JSON.stringify(row.input.book) !== JSON.stringify(first))) {
      throw new VatFixtureRepositoryError("UNAVAILABLE");
    }
    const book = vatTreatmentFixtureBookV1.parse({ ...first, tenantId: context.tenantId, jobId,
      documents: records.map(row => row.input.document) });
    return { environment: "synthetic" as const, label: VAT_FIXTURE_LABEL, lineage: "fixture lineage, never authority" as const,
      records, book, reconciliation: reconcileVatTreatmentFixtures(book) };
  }
  async read(context: VerifiedTenantContext, actor: string, jobId: string) {
    const job = id.safeParse(jobId), member = id.safeParse(actor);
    if (!job.success || !member.success) throw new VatFixtureRepositoryError("INVALID_INPUT");
    return this.guarded(() => withTenant(this.pool, context, async db => {
      const current = await db.$client.query(`SELECT id FROM app.membership
        WHERE tenant_id=$1 AND id=$2 AND role IN ('owner', 'admin')
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`,
      [context.tenantId, member.data]);
      if (!current.rows.length) throw new VatFixtureRepositoryError("FORBIDDEN");
      return this.project(context, job.data, await this.rows(db, context, job.data, member.data, "read"));
    }));
  }
  async command(context: VerifiedTenantContext, actor: string, raw: unknown) {
    const parsed = append.safeParse(raw), member = id.safeParse(actor);
    if (!parsed.success || !member.success) throw new VatFixtureRepositoryError("INVALID_INPUT");
    const input = parsed.data;
    return this.guarded(() => withTenant(this.pool, context, async db => {
      // Transaction-scoped job-book lock is held through core validation and append.
      const records = await this.rows(db, context, input.jobId, member.data, "lock");
      const prior = records.find(row => row.input.commandId === input.commandId);
      if (prior) {
        if (prior.actorId !== member.data || JSON.stringify(prior.input) !== JSON.stringify(input)) {
          throw new VatFixtureRepositoryError("CONFLICT");
        }
        return this.project(context, input.jobId, records);
      }
      if (records.length && JSON.stringify(records[0]!.input.book) !== JSON.stringify(input.book)) {
        throw new VatFixtureRepositoryError("CONFLICT");
      }
      // All tax, credit, eligibility, lineage and arithmetic rules stay in core.
      reconcileVatTreatmentFixtures({ ...input.book, tenantId: context.tenantId, jobId: input.jobId,
        documents: [...records.map(row => row.input.document), input.document] });
      return this.project(context, input.jobId,
        await this.rows(db, context, input.jobId, member.data, "append", input));
    }));
  }
}
