import { createHash, randomUUID } from "node:crypto";
import { evaluateDraftQuote, jobPartiesSnapshotV1, quoteDocumentV1, renderQuotePdf, type QuoteLine } from "@jobguard/core";
import type { Pool } from "pg";
import { UserCommandDispatcher } from "./commands.js";
import { firmProfileIssuer } from "./firm-profile-repository.js";
import { requirePilotCommandOwner } from "./pilot-command-owner.js";
import { QuoteDeliveryRepository } from "./quote-delivery-repository.js";
import { IssueQuoteMutation } from "./quote-document-repository.js";
import { assertQuoteScopeCoverage } from "./quote-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const invitationText = "Pilot fixture. You are invited to review this exact quote with your builder.";
const hashBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function currentParties(db: TenantTransaction, tenantId: string, jobId: string) {
  // The checked routine takes a job lock which serializes changes to the parties.
  const result = await db.$client.query<{ snapshot: unknown }>(
    "SELECT app.require_current_job_parties($1,$2) AS snapshot", [tenantId, jobId],
  );
  return jobPartiesSnapshotV1.parse(result.rows[0]?.snapshot);
}

type Pricing = {
  id: string; revision: number; currency: string; tax_policy_version: string;
  subtotal_pence: string; discount_pence: string; net_pence: string; tax_pence: string; total_pence: string;
  lines: QuoteLine[];
};

/** Stages a single immutable package for the existing fake quote delivery adapter. */
export class PilotQuoteDeliveryRepository {
  constructor(private readonly pool: Pool) {}

  async preview(context: VerifiedTenantContext, jobId: string, recipient: string, expectedRevision: number) {
    if (!recipient.endsWith(".invalid")) throw new Error("RECIPIENT_CHANGED");
    return withTenant(this.pool, context, async db => {
      await requirePilotCommandOwner(db);
      // Reference allocation locks the firm and job before the draft and profile.
      const { reference } = (await db.$client.query<{ reference: string }>(
        "SELECT app.allocate_quote_job_reference($1) AS reference", [jobId],
      )).rows[0]!;
      const parties = await currentParties(db, context.tenantId, jobId);
      if (parties.customer.email?.toLowerCase() !== recipient) throw new Error("RECIPIENT_CHANGED");
      await db.$client.query("SELECT id FROM app.quote_draft WHERE tenant_id=$1 AND job_id=$2 FOR SHARE", [context.tenantId, jobId]);

      const pricing = (await db.$client.query<Pricing>(`
        SELECT qr.*, coalesce(json_agg(json_build_object(
          'id', ql.id, 'scopeItemId', ql.scope_item_id, 'scopeRevisionId', ql.scope_revision_id,
          'description', ql.description, 'origin', ql.origin, 'included', ql.included,
          'exclusionReason', ql.exclusion_reason, 'quantity', ql.quantity_decimal, 'unit', ql.unit,
          'unitRatePence', ql.unit_rate_pence, 'discountPercent', ql.discount_decimal, 'taxTreatment', ql.tax_treatment,
          'rateProvenance', ql.rate_provenance, 'category', ql.category, 'region', ql.region
        ) ORDER BY ql.ordinal) FILTER (WHERE ql.id IS NOT NULL), '[]') AS lines
        FROM app.quote_draft qd
        JOIN app.quote_revision qr ON (qr.tenant_id,qr.job_id,qr.id)=(qd.tenant_id,qd.job_id,qd.current_revision_id)
        LEFT JOIN app.quote_line ql ON (ql.tenant_id,ql.quote_revision_id)=(qr.tenant_id,qr.id)
        WHERE qd.tenant_id=$1 AND qd.job_id=$2 AND qr.issuable
        GROUP BY qr.tenant_id,qr.id`, [context.tenantId, jobId],
      )).rows[0];
      if (!pricing) throw new Error("QUOTE_NOT_ISSUABLE");
      if (pricing.revision !== expectedRevision) throw new Error("QUOTE_CHANGED");
      await assertQuoteScopeCoverage(db, context.tenantId, jobId, pricing.id);

      const issuer = await firmProfileIssuer(db, jobId, undefined, true);
      const latest = (await db.$client.query<{ id: string; content_hash: string; snapshot: unknown }>(
        `SELECT id, content_hash, snapshot FROM app.quote_document_version
         WHERE tenant_id=$1 AND job_id=$2 ORDER BY document_version DESC LIMIT 1`, [context.tenantId, jobId],
      )).rows[0];
      const previous = latest ? quoteDocumentV1.parse(latest.snapshot) : undefined;
      if (latest && previous?.quoteRevisionId === pricing.id && previous.reference === reference &&
        previous.jobParties?.bindingId === parties.bindingId && previous.customer.email === recipient &&
        previous.qualifications.includes(invitationText) && JSON.stringify(previous.issuer) === JSON.stringify(issuer)) {
        if (hashBytes(renderQuotePdf(previous)) !== latest.content_hash) throw new Error("QUOTE_CHANGED");
        return { documentId: latest.id, document: previous };
      }

      const documentVersion = Math.max(pricing.revision, (previous?.documentVersion ?? 0) + 1);
      const lines = pricing.lines.filter(line => line.included).map(line => ({
        scopeItemId: line.scopeItemId, description: line.description, quantity: line.quantity, unit: line.unit,
        netPence: evaluateDraftQuote({ currency: pricing.currency, taxPolicyVersion: pricing.tax_policy_version, lines: [line] }).totals.net.pence,
      }));
      const document = quoteDocumentV1.parse({
        jobParties: parties, schemaVersion: "quote-document.v1", documentVersion, reference,
        quoteRevisionId: pricing.id, currency: "GBP", issuer,
        customer: {
          name: parties.customer.name, email: recipient,
          address: [...parties.site.addressLines, parties.site.town, parties.site.postcode],
        },
        lines,
        exclusions: pricing.lines.filter(line => !line.included).map(line => `${line.description}: ${line.exclusionReason}`.slice(0, 500)),
        qualifications: [invitationText, `Invitation for quote ${reference}, document version ${documentVersion}.`],
        subtotalPence: Number(pricing.subtotal_pence), discountPence: Number(pricing.discount_pence),
        netPence: Number(pricing.net_pence), taxPence: Number(pricing.tax_pence), totalPence: Number(pricing.total_pence),
      });
      if (lines.reduce((total, line) => total + line.netPence, 0) !== document.netPence) throw new Error("QUOTE_NOT_ISSUABLE");
      const pdf = renderQuotePdf(document);
      const hash = hashBytes(pdf), documentId = randomUUID();
      await db.$client.query(`
        INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,
          object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [documentId, context.tenantId, jobId, pricing.id, documentVersion, reference, hash, `runtime/quotes/${documentId}.pdf`,
          hash, pdf.byteLength, JSON.stringify(document.issuer), JSON.stringify(document.customer), JSON.stringify(document)]);
      return { documentId, document };
    });
  }

  async issue(context: VerifiedTenantContext, jobId: string,
    input: { documentId: string; contentHash: string; recipient: string; commandId: string },
    pilot: { actorMembershipId: string; checkGate: () => void }) {
    const { documentId, contentHash, recipient, commandId } = input;
    const row = await withTenant(this.pool, context, async db => (await db.$client.query<{ snapshot: unknown; content_hash: string }>(
      "SELECT snapshot, content_hash FROM app.quote_document_version WHERE tenant_id=$1 AND job_id=$2 AND id=$3",
      [context.tenantId, jobId, documentId],
    )).rows[0]);
    if (!row || row.content_hash !== contentHash) throw new Error("QUOTE_CHANGED");
    const document = quoteDocumentV1.parse(row.snapshot);
    const pdf = renderQuotePdf(document);
    if (document.customer.email !== recipient || !document.qualifications.includes(invitationText) ||
      hashBytes(pdf) !== contentHash) throw new Error("QUOTE_CHANGED");

    const mutation = new IssueQuoteMutation({
      tenantId: context.tenantId, jobId, documentId, outboxActionId: randomUUID(), recipients: [recipient],
      immutableContent: new TextDecoder().decode(pdf),
    });
    await new UserCommandDispatcher(this.pool).dispatch(context, {
      version: "command.v1", commandId, commandType: "quote.send", semanticKey: `quote-send:${documentId}`,
      actorMembershipId: pilot.actorMembershipId, subjectType: "quote_document", subjectRef: documentId, authorizationId: randomUUID(),
      action: {
        actionType: "quote.send", recipient: JSON.stringify([recipient]), contentHash, aggregateRevision: document.documentVersion,
        amountPence: null, currency: null, policyVersion: "free-quote-send.v1", expiresAt: new Date(Date.now() + 3600_000),
      },
    }, {
      lock: async (db, command) => {
        await requirePilotCommandOwner(db);
        await mutation.lock(db, command);
        const parties = await currentParties(db, context.tenantId, jobId);
        const current = (await db.$client.query<{ current_revision_id: string; latest: number }>(`
          SELECT q.current_revision_id, (SELECT max(d.document_version) FROM app.quote_document_version d
           WHERE (d.tenant_id,d.job_id)=(q.tenant_id,q.job_id)) AS latest
          FROM app.quote_draft q WHERE q.tenant_id=$1 AND q.job_id=$2 FOR SHARE OF q`, [context.tenantId, jobId],
        )).rows[0];
        const issuer = await firmProfileIssuer(db, jobId, undefined, true);
        if (current?.current_revision_id !== document.quoteRevisionId || current?.latest !== document.documentVersion ||
          parties.bindingId !== document.jobParties?.bindingId || parties.customer.email?.toLowerCase() !== recipient ||
          JSON.stringify(issuer) !== JSON.stringify(document.issuer)) throw new Error("QUOTE_CHANGED");
        pilot.checkGate();
      },
      mutate: (db, command) => {
        pilot.checkGate();
        return mutation.mutate(db, command);
      },
    });
    const delivery = await new QuoteDeliveryRepository(this.pool).view(context, jobId, documentId);
    if (!delivery) throw new Error("NOT_FOUND");
    return { ...delivery, invitation: { jobId, documentId, contentHash, recipient, documentVersion: document.documentVersion } };
  }
}
