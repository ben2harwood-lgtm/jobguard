import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { downloadPlatformInvoice, issuePlatformInvoiceFixture, platformInvoiceCanonical, PlatformInvoiceError,
  downloadIssuedSimulationFeeStatement, platformInvoiceProfileV1, platformInvoiceIssueCommandV1, type PlatformInvoiceRequest,
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

// Read only the statement's exact stored amount and its explicit approval. A newer statement
// blocks new issuance from this one; stored replay/credit traces remain bound to the original.
// The source hash also binds the entire persisted proof snapshot.
const successFeeSourceSql = `SELECT s.*,z.id approval_id,z.content_hash approval_hash,
 app.final_lock_hash(s.document) recomputed_hash,
 app.final_lock_hash(s.document->'sourceSnapshot') snapshot_hash
 FROM app.platform_fee_statement s
 JOIN app.job j ON(j.tenant_id,j.id)=(s.tenant_id,s.job_id)
 JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(s.tenant_id,s.job_id)
 JOIN app.action_authorization z ON z.tenant_id=s.tenant_id AND z.recipient=s.id::text
  AND z.content_hash=s.document_hash AND z.action_type='success_fee.statement_approve'
 JOIN app.decision d ON(d.tenant_id,d.id)=(z.tenant_id,z.decision_id)
  AND d.subject_type='simulation_fee_statement' AND d.subject_ref=s.id::text AND d.action_type=z.action_type
 JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(z.tenant_id,z.resolution_id)
  AND r.decision_id=d.id AND r.resolution='approved' AND r.actor_membership_id=z.actor_membership_id
 WHERE s.tenant_id=$1 AND s.id=$2 AND s.namespace='success_fee.synthetic.v1'
  AND track.environment='synthetic_demo' AND track.job_track='small_builder'
  AND z.policy_version='reference_fee_policy_v3' AND z.currency='GBP'
  AND z.amount_pence::text=s.document->'documentPrincipal'->>'pence'
  AND z.revoked_at IS NULL AND z.expires_at>clock_timestamp()
  AND ($3::boolean OR NOT EXISTS(SELECT 1 FROM app.platform_fee_statement newer
    WHERE newer.tenant_id=s.tenant_id AND newer.job_id=s.job_id AND newer.sequence>s.sequence))
 ORDER BY z.id LIMIT 1 FOR SHARE OF s,j,track,z,d,r`;
const feeSettlementSql = `SELECT a.id,a.authorization_id,a.kind,a.amount_pence,
 (SELECT jsonb_agg(jsonb_build_object('revision',e.revision,'state',e.state) ORDER BY e.revision)
 FROM app.platform_fee_attempt_event e WHERE e.tenant_id=a.tenant_id AND e.job_id=a.job_id AND e.attempt_id=a.id) events
 FROM app.platform_fee_attempt a WHERE a.tenant_id=$1 AND a.job_id=$2 AND a.statement_id=$3 ORDER BY a.id`;

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
      if (command.lines.some(line => line.sourceKind === "success_fee"))
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('platform-fee-statement:'||$1::text,0))", [context.tenantId]);
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
        `platform_invoice.simulation_${command.kind}`, command.commandId, JSON.stringify({ references: { number: document.number }, hashes: { documentHash: downloadPlatformInvoice(document).hash } })]);
      return document;
    });
  }
  private async successFeeSource(client: PoolClient, tenantId: string, line: PlatformInvoiceIssueCommand["lines"][number], storedSource: boolean) {
    const unavailable = () => new PlatformInvoiceError("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
    const s = (await client.query(successFeeSourceSql, [tenantId, line.sourceId, storedSource])).rows[0];
    if (!s || s.document_hash !== line.expectedSourceHash || s.document_hash !== s.recomputed_hash ||
        s.source_hash !== s.snapshot_hash) throw unavailable();
    let document;
    try { document = downloadIssuedSimulationFeeStatement(s.document, s.document_hash).document; }
    catch { throw unavailable(); }
    if (document.statementId !== s.id || document.jobId !== s.job_id || document.documentPrincipal.pence <= 0)
      throw unavailable();
    const attempts = (await client.query(feeSettlementSql, [tenantId, s.job_id, s.id])).rows;
    if (attempts.some(a => !a.events?.length)) throw unavailable();
    const provenance = { kind: "success_fee" as const, level: "statement" as const, jobId: s.job_id as string,
      statement: { tenantId, id: s.id as string, hash: s.document_hash as string },
      approval: { tenantId, id: s.approval_id as string, hash: s.approval_hash as string },
      policyVersion: document.policyVersion, sourceSnapshot: document.sourceSnapshot,
      priorSettlements: attempts.length ? { state: "recorded" as const, attempts: attempts.map(a => ({
        id: a.id as string, authorizationId: a.authorization_id as string, kind: a.kind as "collection" | "refund",
        amountPence: Number(a.amount_pence), events: a.events as { revision: number; state: "pending" | "outcome_unknown" | "settled" | "definite_failure" }[],
      })) } : { state: "none_recorded" as const },
    };
    return { amount: document.documentPrincipal.pence, provenance };
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
    if (line.sourceKind === "contractor_fee") throw new PlatformInvoiceError("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
    let amount: number, provenance: PlatformInvoiceRequest["lines"][number]["provenance"];
    if (line.sourceKind === "success_fee") {
      // Settlements are a snapshot at first issuance. Replay and full credits retain the
      // original immutable trace while rechecking the stored statement/approval.
      const original = history.find(d => replay ? d.request.commandId === command.commandId :
        command.kind === "credit_note" && d.request.kind === "invoice" && d.number === command.originalNumber);
      const saved = original?.request.lines.find(l => l.id === line.id && l.provenance.statement.id === line.sourceId);
      const source = await this.successFeeSource(client, tenantId, line, Boolean(saved));
      amount = source.amount; provenance = source.provenance;
      if (saved) {
        const { priorSettlements: _current, ...current } = provenance;
        const prior = saved.provenance;
        if (prior.kind !== "success_fee" || !("level" in prior)) throw new PlatformInvoiceError("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
        const { priorSettlements: _saved, ...stored } = prior;
        if (platformInvoiceCanonical(current) !== platformInvoiceCanonical(stored) || saved.sourcePrincipalPence !== amount)
          throw new PlatformInvoiceError("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
        provenance = prior;
      }
    } else {
      const s = (await client.query(subscriptionSourceSql, [tenantId, line.sourceId])).rows[0];
      if (!s || s.artifact_hash !== line.expectedSourceHash || s.artifact_hash !== s.recomputed_hash ||
        s.catalogue_version !== "subscription_pricing_policy_v4" || BigInt(s.amount_pence) !== BigInt(s.principal_pence) ||
        s.line_total === null || BigInt(s.amount_pence) !== BigInt(s.line_total)) throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
      amount = Number(s.amount_pence);
      provenance = { kind: "subscription" as const, statement: { tenantId, id: s.id, hash: s.artifact_hash },
        approval: { tenantId, id: s.approval_id, hash: s.approval_hash }, period: s.period, policyVersion: "subscription_pricing_policy_v4" as const };
    }
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
