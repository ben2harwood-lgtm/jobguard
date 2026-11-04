import "server-only";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { matchSupplierLines, supplierLineCorrectionV1, type SupplierLineMatchInput } from "@jobguard/core";
import { authorizePracticeJob, SupplierLineCorrectionRepository, withTenant } from "@jobguard/db";

const uuid = z.guid().transform(value => value.toLowerCase());
const queryV1 = z.object({ version: z.literal("supplier-lines-read.v1"), snapshotId: uuid.optional(),
  revision: z.coerce.number().int().nonnegative().max(2_147_483_647).optional() }).strict();
const confirmV1 = z.object({ version: z.literal("supplier-lines-confirm.v1"), commandId: uuid,
  snapshotId: uuid, lineVersionIds: z.array(uuid).min(1).max(1500) }).strict();
const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };

/** Fixed fictional source data, never an extraction/provider or labelled benchmark. */
function proposal(tenantId: string, jobId: string) {
  const id = (key: string) => {
    const hex = createHash("sha256").update(`supplier-lines-demo.v1:${tenantId}:${jobId}:${key}`).digest("hex");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  };
  const line = (key: string) => ({ lineId: id(`${key}:line`), versionId: id(`${key}:version`),
    documentVersionId: id(`${key}:document`), sourceHash: createHash("sha256").update(`fictional:${key}`).digest("hex"),
    page: 1, sku: "TIMBER", orderReference: "DEMO-PO-1", unit: "each", baseUnit: "each", unitsPerPack: "1" });
  const facts: SupplierLineMatchInput = { version: "supplier-line-match-input.v1", environment: "synthetic_demo",
    tenantId, jobId, merchantId: id("merchant"), orders: [{ ...line("order"), quantity: "10", unitNetPence: 100,
      discountBps: 0, rateVersionId: id("rate"), validFrom: "2030-01-01", validTo: "2030-01-31" }],
    receipts: [{ ...line("receipt"), acceptedQuantity: "8" }], bills: [{ ...line("invoice"), kind: "invoice",
      documentReference: "DEMO-INV-1", quantity: "10", netPence: 1000, taxBasis: "net", supplyDate: "2030-01-02",
      creditsInvoiceVersionId: null }], aliases: [], mappings: [] };
  return { snapshotId: id("snapshot"), facts };
}

export class SupplierLinesService {
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {}
  private async access(jobId: string) { return authorizePracticeJob(this.pool, this.sessionId, jobId); }
  async read(jobId: string, raw: unknown) {
    const auth = await this.access(jobId), query = queryV1.parse(raw);
    const draft = proposal(auth.context.tenantId, jobId);
    const snapshotId = query.snapshotId ?? (await withTenant(this.pool, auth.context, async db =>
      (await db.$client.query<{ id: string }>(`SELECT id FROM app.supplier_line_match_snapshot
        WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at DESC,id LIMIT 1`, [auth.context.tenantId, jobId])).rows[0]?.id));
    if (!snapshotId) {
      if (query.revision !== undefined) fail("MATCH_NOT_FOUND");
      return { confirmed: false, revision: 0, ...draft, result: matchSupplierLines(draft.facts), history: [] };
    }
    return { confirmed: true, ...await new SupplierLineCorrectionRepository(this.pool).read(auth.context, { membershipId: auth.membershipId, identityUserId: auth.identityUserId }, {
      version: "supplier-line-match-read.v1", jobId, snapshotId, revision: query.revision }) };
  }
  async command(jobId: string, raw: unknown) {
    const auth = await this.access(jobId), repo = new SupplierLineCorrectionRepository(this.pool);
    // The repository's actor schema is strict; only session-derived identity fields cross it.
    const actor = { membershipId: auth.membershipId, identityUserId: auth.identityUserId };
    if (typeof raw === "object" && raw !== null && "version" in raw && raw.version === "supplier-lines-confirm.v1") {
      const input = confirmV1.parse(raw), draft = proposal(auth.context.tenantId, jobId);
      const expected = [...draft.facts.orders, ...draft.facts.receipts, ...draft.facts.bills].map(row => row.versionId).sort();
      if (input.snapshotId !== draft.snapshotId || JSON.stringify([...input.lineVersionIds].sort()) !== JSON.stringify(expected))
        fail("MATCH_SOURCE_VERSION_CONFLICT");
      return { confirmed: true, ...await repo.create(auth.context, actor, { version: "supplier-line-snapshot.v1",
        commandId: input.commandId, snapshotId: draft.snapshotId, facts: draft.facts }) };
    }
    const input = supplierLineCorrectionV1.parse(raw);
    return { confirmed: true, ...await repo.correct(auth.context, actor, jobId, input) };
  }
}
export type SupplierLinesView = Awaited<ReturnType<SupplierLinesService["read"]>>;
