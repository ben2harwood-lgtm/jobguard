import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  proposeSupplierMatch,
  type SupplierMatchCorrection,
} from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
const hash = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
export class SupplierMatchRepository {
  constructor(private pool: Pool) {}
  async create(
    context: VerifiedTenantContext,
    jobId: string,
    input: { commandId: string; expectedRevision: number },
  ) {
    return withTenant(this.pool, context, async (db) => {
      const sources = await this.sources(db.$client, context.tenantId, jobId);
      const proposal = proposeSupplierMatch({
        version: "supplier-match-input.v1",
        jobId,
        order: sources.order,
        receipts: sources.receipts,
        bill: sources.bill,
        aliases: {},
        unitConversions: {},
      });
      const existing = (
        await db.$client.query<any>(
          `SELECT id,state FROM app.supplier_match_proposal WHERE tenant_id=$1 AND job_id=$2 AND digest=$3`,
          [context.tenantId, jobId, proposal.digest],
        )
      ).rows[0];
      if (existing) return this.viewIn(db.$client, context.tenantId, jobId);
      const payloadHash = hash(proposal);
      const audits = await appendAuditBatch(db, [
        {id:randomUUID(),version:"audit.v1",actorRef:"member:synthetic-builder",eventType:"supplier_match.proposed",subjectType:"job",subjectRef:jobId,payload:{references:{proposalId:proposal.id},hashes:{payloadHash},classifications:{action:"operational"}}},
        ...(proposal.state === "matched" ? [{id:randomUUID(),version:"audit.v1" as const,actorRef:"member:synthetic-builder",eventType:"supplier_match.confirmed",subjectType:"supplier_match",subjectRef:proposal.id,payload:{references:{proposalId:proposal.id},hashes:{payloadHash:hash(input)},classifications:{action:"operational" as const}}}] : []),
      ]);
      const audit = audits[0]!;
      await db.$client.query(
        `INSERT INTO app.supplier_match_proposal(id,tenant_id,job_id,digest,state,ambiguity_reason,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9,$10,$3,$11,$12)`,
        [
          proposal.id,
          context.tenantId,
          jobId,
          proposal.digest,
          proposal.state,
          proposal.reason,
          sources.order.versionId,
          sources.receipts.map((x: any) => x.versionId),
          sources.bill.versionId,
          "member:synthetic-builder",
          payloadHash,
          audit.id,
        ],
      );
      if (proposal.state === "matched")
        await this.insertRevision(
          db.$client,
          context.tenantId,
          jobId,
          {
            version: "supplier-match-correction.v1",
            commandId: input.commandId,
            proposalId: proposal.id,
            expectedRevision: input.expectedRevision,
            orderVersionId: sources.order.versionId,
            receiptVersionIds: sources.receipts.map((x: any) => x.versionId),
            billVersionId: sources.bill.versionId,
            allocations: sources.receipts.map((x: any) => ({
              receiptVersionId: x.versionId,
              quantity: x.quantity,
            })),
          },
          audits[1]!.id,
        );
      return this.viewIn(db.$client, context.tenantId, jobId);
    });
  }
  async correct(
    context: VerifiedTenantContext,
    jobId: string,
    input: SupplierMatchCorrection,
  ) {
    return withTenant(this.pool, context, async (db) => {
      if (
        new Set(input.allocations.map((x) => x.receiptVersionId)).size !==
        input.allocations.length
      )
        throw new Error("RECEIVED_QUANTITY_ALREADY_ALLOCATED");
      const replay = (
          await db.$client.query<any>(
            `SELECT payload_hash FROM app.supplier_match_revision WHERE tenant_id=$1 AND command_id=$2`,
            [context.tenantId, input.commandId],
          )
        ).rows[0],
        payloadHash = hash(input);
      if (replay) {
        if (replay.payload_hash !== payloadHash)
          throw new Error("IDEMPOTENCY_CONFLICT");
        return this.viewIn(db.$client, context.tenantId, jobId);
      }
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.proposalId]);
      const proposal = (
        await db.$client.query<any>(
          `SELECT * FROM app.supplier_match_proposal WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,
          [context.tenantId, jobId, input.proposalId],
        )
      ).rows[0];
      if (!proposal) throw new Error("MATCH_PROPOSAL_NOT_FOUND");
      const count = Number(
        (
          await db.$client.query(
            `SELECT count(*) n FROM app.supplier_match_revision WHERE tenant_id=$1 AND job_id=$2 AND proposal_id=$3`,
            [context.tenantId, jobId, input.proposalId],
          )
        ).rows[0].n,
      );
      if (count !== input.expectedRevision)
        throw new Error("MATCH_REVISION_CONFLICT");
      if (
        input.orderVersionId !== proposal.order_revision_id ||
        input.billVersionId !== proposal.bill_revision_id ||
        input.receiptVersionIds.some(
          (x: string) => !proposal.receipt_version_ids.includes(x),
        )
      )
        throw new Error("MATCH_SOURCE_VERSION_CONFLICT");
      for (const allocation of input.allocations) {
        const receipt = (
          await db.$client.query<any>(
            `SELECT accepted_quantity::text,unit FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,
            [context.tenantId, jobId, allocation.receiptVersionId],
          )
        ).rows[0];
        if (!receipt) throw new Error("MATCH_RECEIPT_NOT_FOUND");
        const allowed = await db.$client.query(
          `SELECT $1::numeric <= $2::numeric ok`,
          [allocation.quantity, receipt.accepted_quantity],
        );
        if (!allowed.rows[0].ok)
          throw new Error("RECEIVED_QUANTITY_ALREADY_ALLOCATED");
      }
      const audit = (
        await appendAuditBatch(db, [
          {
            id: randomUUID(),
            version: "audit.v1",
            actorRef: "member:synthetic-builder",
            eventType: "supplier_match.corrected",
            subjectType: "supplier_match",
            subjectRef: input.proposalId,
            payload: {
              references: { proposalId: input.proposalId },
              hashes: { payloadHash },
              classifications: { action: "operational" },
            },
          },
        ])
      )[0]!;
      await this.insertRevision(
        db.$client,
        context.tenantId,
        jobId,
        input,
        audit.id,
      );
      return this.viewIn(db.$client, context.tenantId, jobId);
    });
  }
  async view(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, (db) =>
      this.viewIn(db.$client, context.tenantId, jobId),
    );
  }
  private async sources(db: any, tenantId: string, jobId: string) {
    const order = (
        await db.query(
          `SELECT r.id version_id,r.revision,r.quantity_decimal,d.id FROM app.purchase_order_revision r JOIN app.purchase_order_draft d ON(d.tenant_id,d.job_id,d.id)=(r.tenant_id,r.job_id,r.draft_id) WHERE r.tenant_id=$1 AND r.job_id=$2 ORDER BY r.revision DESC LIMIT 1`,
          [tenantId, jobId],
        )
      ).rows[0],
      receipts = (
        await db.query(
          `SELECT id,revision,accepted_quantity::text quantity_decimal,unit FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision`,
          [tenantId, jobId],
        )
      ).rows,
      bill = (
        await db.query(
          `SELECT r.id version_id,r.revision,r.quantity_decimal::text,d.id FROM app.supplier_fact_revision r JOIN app.supplier_document d ON(d.tenant_id,d.job_id,d.id)=(r.tenant_id,r.job_id,r.document_id) WHERE r.tenant_id=$1 AND r.job_id=$2 AND r.document_type='invoice' ORDER BY r.created_at DESC LIMIT 1`,
          [tenantId, jobId],
        )
      ).rows[0];
    if (!order || !receipts.length || !bill)
      throw new Error("CONFIRMED_MATCH_SOURCES_REQUIRED");
    const sku = "MAT-B";
    return {
      order: {
        id: order.id,
        versionId: order.version_id,
        revision: Number(order.revision),
        sku,
        quantity: String(Number(order.quantity_decimal)),
        unit: "each",
      },
      receipts: receipts.map((r: any) => ({
        id: r.id,
        versionId: r.id,
        revision: Number(r.revision),
        sku,
        quantity: String(Number(r.quantity_decimal)),
        unit: r.unit,
      })),
      bill: {
        id: bill.id,
        versionId: bill.version_id,
        revision: Number(bill.revision),
        sku,
        quantity: String(Number(bill.quantity_decimal)),
        unit: "each",
      },
    };
  }
  private async insertRevision(
    db: any,
    tenantId: string,
    jobId: string,
    input: SupplierMatchCorrection,
    auditEventId: string,
  ) {
    const revision = input.expectedRevision + 1,
      id = randomUUID(),
      payloadHash = hash(input);
    await db.query(
      `INSERT INTO app.supplier_match_revision(id,tenant_id,job_id,proposal_id,command_id,revision,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9,'member:synthetic-builder',$4,$10,$11)`,
      [
        id,
        tenantId,
        jobId,
        input.proposalId,
        input.commandId,
        revision,
        input.orderVersionId,
        input.receiptVersionIds,
        input.billVersionId,
        payloadHash,
        auditEventId,
      ],
    );
    for (const a of input.allocations)
      await db.query(
        `INSERT INTO app.supplier_match_allocation(id,tenant_id,job_id,match_revision_id,receipt_version_id,quantity_decimal,unit)VALUES($1,$2,$3,$4,$5,$6,'each')`,
        [randomUUID(), tenantId, jobId, id, a.receiptVersionId, a.quantity],
      );
  }
  private async viewIn(db: any, tenantId: string, jobId: string) {
    const row = (
      await db.query(
        `SELECT p.*,r.id revision_id,r.revision,(SELECT quantity_decimal::text FROM app.purchase_order_revision o WHERE o.tenant_id=p.tenant_id AND o.id=p.order_revision_id) ordered,(SELECT quantity_decimal::text FROM app.supplier_fact_revision b WHERE b.tenant_id=p.tenant_id AND b.id=p.bill_revision_id) billed,COALESCE((SELECT sum(a.quantity_decimal)::text FROM app.supplier_match_allocation a WHERE a.tenant_id=p.tenant_id AND a.match_revision_id=r.id),'0') received FROM app.supplier_match_proposal p LEFT JOIN LATERAL(SELECT * FROM app.supplier_match_revision x WHERE x.tenant_id=p.tenant_id AND x.proposal_id=p.id ORDER BY x.revision DESC LIMIT 1)r ON true WHERE p.tenant_id=$1 AND p.job_id=$2 ORDER BY p.created_at DESC LIMIT 1`,
        [tenantId, jobId],
      )
    ).rows[0];
    if (!row) return { proposal: null, revision: 0, history: [] };
    const history = (
      await db.query(
        `SELECT r.id,r.revision,r.order_revision_id,r.receipt_version_ids,r.bill_revision_id,r.payload_hash,e.sequence audit_sequence,r.invalidates_unresolved_findings FROM app.supplier_match_revision r JOIN app.audit_event e ON(e.tenant_id,e.id)=(r.tenant_id,r.audit_event_id) WHERE r.tenant_id=$1 AND r.job_id=$2 AND r.proposal_id=$3 ORDER BY r.revision`,
        [tenantId, jobId, row.id],
      )
    ).rows;
    return {
      proposal: {
        id: row.id,
        digest: row.digest,
        state: row.state,
        reason: row.ambiguity_reason,
        orderVersionId: row.order_revision_id,
        receiptVersionIds: row.receipt_version_ids,
        billVersionId: row.bill_revision_id,
        ordered: `${Number(row.ordered)} each`,
        received: `${Number(row.received)} each`,
        billed: `${Number(row.billed)} each`,
      },
      revision: Number(row.revision ?? 0),
      history: history.map((x: any) => ({
        ...x,
        revision: Number(x.revision),
        audit_sequence: Number(x.audit_sequence),
      })),
    };
  }
}
