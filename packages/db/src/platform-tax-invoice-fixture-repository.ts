import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { downloadPlatformInvoice, issuePlatformInvoiceFixture, platformInvoiceCanonical, PlatformInvoiceError,
  platformInvoiceProfileV1, platformInvoiceIssueCommandV1, type PlatformInvoiceRequest,
  type PlatformInvoiceIssueCommand, type PlatformInvoiceDocument } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

// Rebuild exactly the 0195 artifact from its immutable period lines/place bindings. A stored hash
// echoed by a caller is insufficient: recomputation, principal totals and authority must also match.
const subscriptionSourceSql = `SELECT s.id,s.artifact_hash,s.amount_pence,p.principal_pence,
 a.catalogue_version,to_char(p.period_start,'YYYY-MM') period,z.id approval_id,z.content_hash approval_hash,
 (SELECT sum(l.amount_pence) FROM app.platform_statement_line l WHERE l.tenant_id=s.tenant_id AND l.statement_id=s.id) line_total,
 app.final_lock_hash(jsonb_build_object('version','subscription-statement.v1','tenantId',s.tenant_id,
 'periodStart',p.period_start::text,'periodEnd',p.period_end::text,'hypothetical',true,'amountPence',s.amount_pence,
 'lines',(SELECT jsonb_agg(jsonb_build_object('lineKey',l.line_key,'kind',l.kind,'numeratorPence',l.numerator_pence::text,
 'denominatorDays',l.denominator_days,'amountPence',l.amount_pence) ORDER BY l.line_key)
 FROM app.subscription_period_line l WHERE l.tenant_id=s.tenant_id AND l.period_id=p.id),
 'bindings',(SELECT coalesce(jsonb_agg(jsonb_build_object('date',b.date::text,'placeKey',b.place_key,
 'customer',v.customer_id,'site',v.site_id,'representative',b.representative_job_id,'attribution',b.attribution)
 ORDER BY b.date,b.place_key),'[]'::jsonb) FROM app.subscription_place_binding b
 JOIN app.subscription_place v ON(v.tenant_id,v.place_key)=(b.tenant_id,b.place_key)
 WHERE b.tenant_id=s.tenant_id AND b.period_id=p.id))) recomputed_hash
 FROM app.platform_statement s
 JOIN app.subscription_period p ON(p.tenant_id,p.id)=(s.tenant_id,s.period_id) AND p.artifact_hash=s.artifact_hash
 JOIN app.subscription_agreement_revision a ON(a.tenant_id,a.revision)=(p.tenant_id,p.agreement_revision)
 JOIN app.action_authorization z ON(z.tenant_id,z.id)=(a.tenant_id,a.authorization_id)
 JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(z.tenant_id,z.resolution_id) AND r.resolution='approved' AND r.decision_id=z.decision_id
 WHERE s.tenant_id=$1 AND s.id=$2 AND s.hypothetical AND s.namespace='subscription.synthetic.v1' AND s.currency='GBP'
 AND a.environment='synthetic_demo' AND z.content_hash=a.content_hash AND z.policy_version=a.catalogue_version
 FOR SHARE OF s,p,a,z,r`;

/** Administrative synthetic adapter only. Runtime has no SQL grants. No caller principal/proof is accepted. */
export class PlatformTaxInvoiceFixtureRepository {
  constructor(private readonly pool: Pool) {}
  async issue(context: VerifiedTenantContext, sessionDigest: string, profileRaw: unknown, raw: unknown): Promise<PlatformInvoiceDocument> {
    const p = platformInvoiceProfileV1.safeParse(profileRaw), c = platformInvoiceIssueCommandV1.safeParse(raw);
    if (!p.success || !c.success || !/^[a-f0-9]{64}$/u.test(sessionDigest)) throw new PlatformInvoiceError("INVALID_PLATFORM_INVOICE");
    if (p.data.tenantId !== context.tenantId || c.data.issuerId !== p.data.issuerId) throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
    return withTenant(this.pool, context, async db => {
      const client = db.$client, profile = p.data, command = c.data;
      await client.query("SELECT 1 FROM app.platform_invoice_issuer LIMIT 0");
      await this.actor(client, context.tenantId, sessionDigest, command.actorMembershipId);
      await client.query("INSERT INTO app.platform_invoice_issuer(tenant_id,id,profile) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING", [context.tenantId, profile.issuerId, JSON.stringify(profile)]);
      const stored = await client.query("SELECT profile FROM app.platform_invoice_issuer WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [context.tenantId, profile.issuerId]);
      if (platformInvoiceCanonical(stored.rows[0]?.profile) !== platformInvoiceCanonical(profile)) throw new PlatformInvoiceError("PLATFORM_INVOICE_CONFLICT");
      await this.actor(client, context.tenantId, sessionDigest, command.actorMembershipId);
      const history = (await client.query("SELECT document,request_hash FROM app.platform_invoice_document WHERE tenant_id=$1 AND issuer_id=$2 ORDER BY sequence", [context.tenantId, profile.issuerId])).rows;
      const requestHash = createHash("sha256").update(platformInvoiceCanonical(command)).digest("hex");
      const replay = history.find(row => row.document.request.commandId === command.commandId);
      if (replay && replay.request_hash !== requestHash) throw new PlatformInvoiceError("PLATFORM_INVOICE_CONFLICT");
      const documents = history.map(row => row.document as PlatformInvoiceDocument);
      const lines: PlatformInvoiceRequest["lines"] = [];
      for (const line of command.lines) lines.push(await this.source(client, context.tenantId, command, line, documents, Boolean(replay)));
      const request: PlatformInvoiceRequest = { ...command, version: "platform-invoice-request.v1", tenantId: context.tenantId, lines };
      const document = issuePlatformInvoiceFixture(profile, request, documents);
      if (replay) return document;
      try {
        // The AFTER INSERT trigger reserves every source in a tenant-wide UNIQUE key, across all issuers.
        await client.query(`INSERT INTO app.platform_invoice_document(tenant_id,issuer_id,sequence,command_id,request_hash,document_hash,number,kind,original_number,document)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [context.tenantId, profile.issuerId, document.sequence, command.commandId,
          requestHash, downloadPlatformInvoice(document).hash, document.number, command.kind, command.originalNumber, JSON.stringify(document)]);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new PlatformInvoiceError("PLATFORM_INVOICE_CONFLICT");
        throw error;
      }
      await client.query("SELECT app.ef_audit($1,$2,'platform_invoice_document',$3,$4::jsonb)", [command.actorMembershipId,
        `platform_invoice.simulation_${command.kind}`, command.commandId, JSON.stringify({ number: document.number, documentHash: downloadPlatformInvoice(document).hash })]);
      return document;
    });
  }
  private async actor(client: PoolClient, tenantId: string, digest: string, expected: string) {
    const session = await client.query("SELECT id FROM identity.session WHERE token_digest=$1 AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE", [digest]);
    if (!session.rowCount) throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
    let actor: string | undefined;
    try { actor = (await client.query("SELECT app.mon1_company_actor($1,$2) id", [tenantId, digest])).rows[0]?.id; }
    catch (error) {
      if ((error as { code?: string }).code === "42501") throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
      throw error;
    }
    if (actor !== expected) throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
    const active = await client.query("SELECT id FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE", [tenantId, actor]);
    if (!active.rowCount) throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
  }
  private async source(client: PoolClient, tenantId: string, command: PlatformInvoiceIssueCommand,
    line: PlatformInvoiceIssueCommand["lines"][number], history: PlatformInvoiceDocument[], replay: boolean): Promise<PlatformInvoiceRequest["lines"][number]> {
    // No accepted v3 success-fee statement adapter exists on this base. Contractor proof/approval
    // reconstruction is not implemented here either. Neither may fall back to supplied manifests.
    if (line.sourceKind !== "subscription") throw new PlatformInvoiceError("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
    const s = (await client.query(subscriptionSourceSql, [tenantId, line.sourceId])).rows[0];
    if (!s || s.artifact_hash !== line.expectedSourceHash || s.artifact_hash !== s.recomputed_hash ||
      s.catalogue_version !== "subscription_pricing_policy_v4" || BigInt(s.amount_pence) !== BigInt(s.principal_pence) ||
      s.line_total === null || BigInt(s.amount_pence) !== BigInt(s.line_total)) throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
    const amount = Number(s.amount_pence);
    const provenance = { kind: "subscription" as const, statement: { tenantId, id: s.id, hash: s.artifact_hash },
      approval: { tenantId, id: s.approval_id, hash: s.approval_hash }, period: s.period, policyVersion: "subscription_pricing_policy_v4" as const };
    let principalPence = amount;
    if (command.kind === "credit_note") {
      const original = history.find(d => d.number === command.originalNumber && d.request.kind === "invoice");
      const old = original?.request.lines.find(l => l.id === line.id && l.provenance.statement.id === line.sourceId);
      if (!old) throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
      // Credit the stored remaining principal, never an amount supplied by the caller.
      const credits = history.filter(d => d.request.kind === "credit_note" && d.request.originalNumber === original!.number &&
        (!replay || d.request.commandId !== command.commandId)).flatMap(d => d.request.lines).filter(l => l.id === line.id);
      principalPence = Number(BigInt(old.principalPence) - credits.reduce((total, l) => total + BigInt(l.principalPence), 0n));
      if (principalPence <= 0) throw new PlatformInvoiceError("PLATFORM_INVOICE_LIMIT");
    }
    return { id: line.id, principalPence, sourcePrincipalPence: amount, taxPence: line.taxPence, provenance };
  }
}
