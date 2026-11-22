import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { UserCommandDispatcher } from "./commands.js";
import { appendOutboundAction } from "./outbox.js";
import { requirePilotCommandOwner } from "./pilot-command-owner.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const invoiceEmailV1 = z.strictObject({
  version: z.literal("invoice-email.v1"), commandId: z.guid(), invoiceId: z.guid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u), revision: z.number().int().positive(),
  recipient: z.email().refine(email => email.endsWith(".invalid")),
});
const invoiceEmailTargetV1 = invoiceEmailV1.extend({ jobId: z.guid() });
const actionType = "customer_invoice.send";
const policyVersion = "customer-invoice-email.fixture.v1";

async function readInvoice(db: TenantTransaction, tenantId: string, input: z.infer<typeof invoiceEmailTargetV1>) {
  await requirePilotCommandOwner(db);
  // The parties routine locks the job while reading the current customer binding.
  const parties = (await db.$client.query<{ snapshot: { customerRevisionId: string; customer: { email?: string } } }>(
    "SELECT app.require_current_job_parties($1,$2) AS snapshot", [tenantId, input.jobId],
  )).rows[0]?.snapshot;
  const invoice = (await db.$client.query<{ pdf_bytes: Buffer; pdf_sha256: string; total_pence: string; revision: number }>(`
    SELECT i.pdf_bytes,i.pdf_sha256,i.total_pence,r.revision
    FROM app.customer_invoice i
    JOIN app.final_account_revision r ON (r.tenant_id,r.job_id,r.id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
    JOIN app.final_account_draft d ON (d.tenant_id,d.job_id,d.current_revision_id)=(r.tenant_id,r.job_id,r.id)
    WHERE (i.tenant_id,i.job_id,i.id)=($1,$2,$3) AND i.synthetic AND i.currency='GBP'
  `, [tenantId, input.jobId, input.invoiceId])).rows[0];
  if (!invoice || !parties || parties.customer.email?.toLowerCase() !== input.recipient ||
      invoice.pdf_sha256 !== input.contentHash || invoice.revision !== input.revision) throw new Error("INVOICE_EMAIL_CHANGED");
  const content = invoice.pdf_bytes.toString("utf8");
  if (createHash("sha256").update(content).digest("hex") !== invoice.pdf_sha256) throw new Error("INVOICE_EMAIL_CHANGED");
  return { content, amountPence: Number(invoice.total_pence), effectKey: `invoice-email:${input.invoiceId}:${parties.customerRevisionId}` };
}

/** Explicit send approval for an existing fictional invoice. Issuance and billing stay separate. */
export class InvoiceEmailRepository {
  constructor(private readonly pool: Pool) {}

  async stage(context: VerifiedTenantContext, jobId: string, raw: unknown,
    pilot: { actorMembershipId: string; checkGate: () => void }) {
    pilot.checkGate();
    const input = invoiceEmailTargetV1.parse({ ...invoiceEmailV1.parse(raw), jobId });
    const preview = await withTenant(this.pool, context, db => readInvoice(db, context.tenantId, input));
    const action = {
      actionType, policyVersion, recipient: input.recipient, contentHash: input.contentHash,
      aggregateRevision: input.revision, amountPence: preview.amountPence, currency: "GBP" as const,
      expiresAt: new Date(Date.now() + 3600_000),
    };
    await new UserCommandDispatcher(this.pool).dispatch(context, {
      version: "command.v1", commandId: input.commandId, commandType: actionType, semanticKey: preview.effectKey,
      actorMembershipId: pilot.actorMembershipId, subjectType: "job", subjectRef: input.jobId, action,
    }, {
      lock: async db => {
        pilot.checkGate();
        const current = await readInvoice(db, context.tenantId, input);
        if (current.effectKey !== preview.effectKey || current.amountPence !== preview.amountPence) throw new Error("INVOICE_EMAIL_CHANGED");
      },
      mutate: async (db, command) => {
        pilot.checkGate();
        const { expiresAt, ...approved } = action;
        await appendOutboundAction(db, context.tenantId, {
          version: "outbound-action.v1", id: randomUUID(), authorizationId: command.authorizationId!,
          adapter: "fake_invoice_delivery", providerEffectKey: preview.effectKey, immutableContent: preview.content,
          ...approved, authorizationExpiresAt: expiresAt,
        });
        return { invoiceId: input.invoiceId };
      },
      auditEvents: () => [{
        id: randomUUID(), version: "audit.v1", actorRef: `membership:${pilot.actorMembershipId}`,
        eventType: "customer_invoice.email_staged", subjectType: "job", subjectRef: input.jobId,
        payload: { references: { invoiceId: input.invoiceId }, hashes: { pdfSha256: input.contentHash }, classifications: { action: "commercial" } },
      }],
    });
    return { version: "invoice-email-staged.v1", invoiceId: input.invoiceId, status: "staged" } as const;
  }
}
