import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { correctSupplierLineMapping, matchSupplierLines, supplierLineCorrectionV1, supplierLineMatchInputV1,
  SupplierMatchCorrectionError, type SupplierLineMatchInput } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { requireSyntheticOrders } from "./purchase-order-action.js";

const uuid = z.guid().transform(value => value.toLowerCase());
const actorV1 = z.object({ membershipId: uuid, identityUserId: uuid }).strict();
const createV1 = z.object({ version: z.literal("supplier-line-snapshot.v1"), commandId: uuid,
  snapshotId: uuid, facts: supplierLineMatchInputV1 }).strict();
const readV1 = z.object({ version: z.literal("supplier-line-match-read.v1"), jobId: uuid, snapshotId: uuid,
  revision: z.number().int().nonnegative().max(2_147_483_647).optional() }).strict();
// All request keys are normalized by the versioned schemas before hashing.
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Actor = z.infer<typeof actorV1>;
type CorrectionRow = { revision: number; correction: unknown; audit_event_id: string; id: string };

/** Dark synthetic application seam. Actor is supplied by the authenticated server principal.
 * Facts are server-owned confirmed fixture snapshots, never raw upload/HTTP data. */
export class SupplierLineCorrectionRepository {
  constructor(private readonly pool: Pool) {}

  private async authorize(db: TenantTransaction, tenantId: string, actor: Actor) {
    const result = await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2
      AND identity_user_id=$3 AND role='owner' AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`,
    [tenantId, actor.membershipId, actor.identityUserId]);
    if (!result.rowCount) throw new SupplierMatchCorrectionError("MATCH_FORBIDDEN");
  }

  private async load(db: TenantTransaction, tenantId: string, jobId: string, snapshotId: string, revision?: number) {
    const snapshot = (await db.$client.query<{ facts: SupplierLineMatchInput }>(
      "SELECT facts FROM app.supplier_line_match_snapshot WHERE tenant_id=$1 AND job_id=$2 AND id=$3",
      [tenantId, jobId, snapshotId])).rows[0];
    if (!snapshot) throw new SupplierMatchCorrectionError("MATCH_NOT_FOUND");
    const history = (await db.$client.query<CorrectionRow>(`SELECT id,revision,correction,audit_event_id
      FROM app.supplier_line_match_correction WHERE tenant_id=$1 AND job_id=$2 AND snapshot_id=$3
      AND ($4::int IS NULL OR revision<=$4) ORDER BY revision`, [tenantId, jobId, snapshotId, revision ?? null])).rows;
    const current = history.at(-1)?.revision ?? 0;
    if (revision !== undefined && current !== revision) throw new SupplierMatchCorrectionError("MATCH_REVISION_CONFLICT");
    let facts = snapshot.facts;
    for (const row of history) facts = correctSupplierLineMapping(facts, row.correction, `correction:${row.id}`);
    return { snapshotId, revision: current, facts, result: matchSupplierLines(facts), history };
  }

  private async lock(db: TenantTransaction, tenantId: string, commandId: string, snapshotId: string) {
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${tenantId}:supplier-line-command:${commandId}`]);
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${tenantId}:supplier-line-snapshot:${snapshotId}`]);
  }

  private async replay(db: TenantTransaction, tenantId: string, commandId: string, requestHash: string) {
    const prior = (await db.$client.query<{ request_hash: string; job_id: string; snapshot_id: string; revision: number }>(`
      SELECT request_hash,job_id,id snapshot_id,0 revision FROM app.supplier_line_match_snapshot WHERE tenant_id=$1 AND command_id=$2
      UNION ALL SELECT request_hash,job_id,snapshot_id,revision FROM app.supplier_line_match_correction WHERE tenant_id=$1 AND command_id=$2`,
    [tenantId, commandId])).rows[0];
    if (!prior) return null;
    if (prior.request_hash !== requestHash) throw new SupplierMatchCorrectionError("MATCH_IDEMPOTENCY_CONFLICT");
    return this.load(db, tenantId, prior.job_id, prior.snapshot_id, prior.revision);
  }

  async create(context: VerifiedTenantContext, rawActor: unknown, raw: unknown) {
    requireSyntheticOrders(); const actor = actorV1.parse(rawActor), input = createV1.parse(raw);
    if (input.facts.tenantId !== context.tenantId) throw new SupplierMatchCorrectionError("MATCH_SCOPE_CONFLICT");
    matchSupplierLines(input.facts);
    const requestHash = hash({ actor, input });
    return withTenant(this.pool, context, async db => {
      await this.authorize(db, context.tenantId, actor);
      await this.lock(db, context.tenantId, input.commandId, input.snapshotId);
      const replay = await this.replay(db, context.tenantId, input.commandId, requestHash);
      if (replay) return replay;
      if ((await db.$client.query("SELECT 1 FROM app.supplier_line_match_snapshot WHERE tenant_id=$1 AND id=$2",
        [context.tenantId, input.snapshotId])).rowCount) throw new SupplierMatchCorrectionError("MATCH_REVISION_CONFLICT");
      const auditId = randomUUID();
      await db.$client.query(`INSERT INTO app.supplier_line_match_snapshot(tenant_id,id,job_id,command_id,
        actor_membership_id,facts,request_hash,audit_event_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [context.tenantId, input.snapshotId, input.facts.jobId, input.commandId, actor.membershipId, JSON.stringify(input.facts), requestHash, auditId]);
      await this.audit(db, actor, input.commandId, input.snapshotId, auditId, requestHash, "created");
      return this.load(db, context.tenantId, input.facts.jobId, input.snapshotId, 0);
    });
  }

  async correct(context: VerifiedTenantContext, rawActor: unknown, rawScope: unknown, raw: unknown) {
    requireSyntheticOrders(); const actor = actorV1.parse(rawActor), jobId = uuid.parse(rawScope);
    const parsed = supplierLineCorrectionV1.safeParse(raw);
    if (!parsed.success) throw new SupplierMatchCorrectionError("INVALID_CORRECTION");
    const input = parsed.data, requestHash = hash({ actor, jobId, input });
    return withTenant(this.pool, context, async db => {
      await this.authorize(db, context.tenantId, actor);
      await this.lock(db, context.tenantId, input.commandId, input.snapshotId);
      const replay = await this.replay(db, context.tenantId, input.commandId, requestHash);
      if (replay) return replay;
      const current = await this.load(db, context.tenantId, jobId, input.snapshotId);
      if (current.revision !== input.expectedRevision) throw new SupplierMatchCorrectionError("MATCH_REVISION_CONFLICT");
      const id = randomUUID(), auditId = randomUUID();
      correctSupplierLineMapping(current.facts, input, `correction:${id}`);
      await db.$client.query(`INSERT INTO app.supplier_line_match_correction(tenant_id,id,job_id,snapshot_id,
        command_id,revision,actor_membership_id,correction,request_hash,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [context.tenantId, id, jobId, input.snapshotId, input.commandId, current.revision + 1,
        actor.membershipId, JSON.stringify(input), requestHash, auditId]);
      await this.audit(db, actor, input.commandId, id, auditId, requestHash, "corrected");
      return this.load(db, context.tenantId, jobId, input.snapshotId);
    });
  }

  async read(context: VerifiedTenantContext, rawActor: unknown, raw: unknown) {
    requireSyntheticOrders(); const actor = actorV1.parse(rawActor), input = readV1.parse(raw);
    return withTenant(this.pool, context, async db => {
      await this.authorize(db, context.tenantId, actor);
      return this.load(db, context.tenantId, input.jobId, input.snapshotId, input.revision);
    });
  }

  private async audit(db: TenantTransaction, actor: Actor, commandId: string, subjectId: string,
    auditId: string, requestHash: string, kind: "created" | "corrected") {
    await appendAuditBatch(db, [{ id: auditId, version: "audit.v1", actorRef: `membership:${actor.membershipId}`,
      eventType: `supplier_line_match.${kind}`, subjectType: "supplier_line_match", subjectRef: subjectId,
      payload: { references: { commandId }, hashes: { requestHash }, classifications: { action: "operational" } } }]);
  }
}
