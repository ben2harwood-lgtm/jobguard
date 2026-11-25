import { createHash } from "node:crypto";
import { requirePilotG1 } from "@jobguard/config";
import { pilotDraftRequestV1, pilotDraftTotals, PILOT_DRAFT_WARNING, type PilotInvoiceDraft } from "@jobguard/core";
import { FinalAccountCommandService, FinalAccountLockRepository, FirmProfileRepository, JobPartiesRepository,
  withTenant, type VerifiedTenantContext } from "@jobguard/db";
import type { Pool } from "pg";
import { z } from "zod";
import type { PilotJobAccess } from "./pilot-job-access.js";

/** Read-only preparation. No invoice application, writer, executor or practice identity. */
export function pilotInvoiceDraft(pool: Pool, context: VerifiedTenantContext, access: PilotJobAccess) {
  async function source(jobId: string) {
    requirePilotG1(process.env);
    if (!z.guid().safeParse(jobId).success) throw new Error("INVALID_COMMAND");
    const actor = await access(jobId, true);
    const [account, lock, profile, parties, commercial] = await Promise.all([
      new FinalAccountCommandService(pool).read(context, jobId),
      new FinalAccountLockRepository(pool).read(context, jobId),
      new FirmProfileRepository(pool).read(context),
      new JobPartiesRepository(pool).view(context, actor.membershipId, jobId),
      withTenant(pool, context, async db => {
        const extras = (await db.$client.query<{ sourceId: string; approvalId: string; quantity: string; unit: string; unitRatePence: string }>(
          `SELECT r.id AS "sourceId",a.id AS "approvalId",r.quantity_decimal AS quantity,r.unit,r.unit_rate_pence AS "unitRatePence" FROM app.variation v
           JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.id)=(v.tenant_id,v.job_id,v.current_revision_id)
           JOIN app.variation_approval a ON(a.tenant_id,a.revision_id)=(r.tenant_id,r.id)
           WHERE v.tenant_id=$1 AND v.job_id=$2 AND v.state='approved' ORDER BY r.id`, [context.tenantId, jobId])).rows;
        const quantities = (await db.$client.query<{ id: string; quantity: string; unit: string; unitRatePence: string; taxTreatment: string }>(
          `SELECT l.id,l.quantity_decimal AS quantity,l.unit,l.unit_rate_pence AS "unitRatePence",l.tax_treatment AS "taxTreatment"
           FROM app.quote_line l JOIN app.job j ON j.tenant_id=l.tenant_id
           JOIN app.quote_document_version d ON(d.tenant_id,d.id,d.quote_revision_id)=(j.tenant_id,j.baseline_quote_version_id,l.quote_revision_id)
           WHERE j.tenant_id=$1 AND j.id=$2 AND l.included ORDER BY l.id`, [context.tenantId, jobId])).rows;
        return { extras, quantities };
      }),
    ]);
    if (!account || account.issueBlocked || !lock.lock || lock.checkStatus !== "completed") throw new Error("REVIEW_INCOMPLETE");
    const savedExtras = account.lines.filter(line => line.kind === "variation");
    if (savedExtras.length !== commercial.extras.length || commercial.extras.some(extra =>
      !savedExtras.some(line => line.sourceId === extra.sourceId && line.approvalId === extra.approvalId))) throw new Error("STALE_REVISION");
    if (!profile.profile || !parties.current) throw new Error("REVIEW_INCOMPLETE");
    const binding = createHash("sha256").update(JSON.stringify({ tenantId: context.tenantId, jobId,
      account, lock, profile: profile.profile, parties: parties.current, commercial })).digest("hex");
    return { binding, account, profile: profile.profile, parties: parties.current, commercial };
  }
  return {
    async read(jobId: string) {
      const current = await source(jobId);
      return { version: "pilot-invoice-draft.v1", jobId, binding: current.binding,
        accountRevision: current.account.revision, sourceHash: current.account.sourceHash };
    },
    async prepare(jobId: string, raw: unknown): Promise<PilotInvoiceDraft> {
      const current = await source(jobId);
      const parsed = pilotDraftRequestV1.safeParse(raw);
      if (!parsed.success) throw new Error("REVIEW_INCOMPLETE");
      const { checklist, binding } = parsed.data;
      if (binding !== current.binding) throw new Error("STALE_REVISION");
      if (current.parties.customer.type !== "person" || current.parties.payingParty.type !== "person" ||
        current.parties.customerRevisionId !== current.parties.payingPartyRevisionId ||
        current.commercial.quantities.some(line => line.taxTreatment !== "standard_rate_20")) throw new Error("REVIEW_INCOMPLETE");
      const lines = current.account.lines.map(line => {
        const quantity = line.kind === "baseline"
          ? current.commercial.quantities.find(item => item.id === line.sourceId)
          : current.commercial.extras.find(item => item.sourceId === line.sourceId);
        return { description: line.description, netPence: line.netPence, quantity: quantity?.quantity ?? null,
          unit: quantity?.unit ?? null, unitRatePence: quantity ? Number(quantity.unitRatePence) : null };
      });
      const totals = pilotDraftTotals(lines);
      if (totals.taxPolicyVersion !== current.account.taxPolicyVersion || totals.netPence !== current.account.totals.net.pence ||
        totals.candidateVatPence !== current.account.totals.tax.pence || totals.grossPence !== current.account.totals.total.pence) throw new Error("STALE_REVISION");
      await access(jobId, true);
      return { version: "pilot-invoice-draft.v1", warning: PILOT_DRAFT_WARNING, jobId, binding,
        accountRevision: current.account.revision, sourceHash: current.account.sourceHash, previewedAt: new Date().toISOString(),
        builder: { name: current.profile.tradingName, address: current.profile.addressLines },
        customer: { name: current.parties.customer.name, address: [] },
        site: [...current.parties.site.addressLines, current.parties.site.town, current.parties.site.postcode],
        vatNumber: checklist.vatNumber, lines, ...totals };
    },
  };
}
