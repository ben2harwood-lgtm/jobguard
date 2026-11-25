import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { supplierFixtureIds } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { practiceMaterialPool, type authenticatePracticeSession } from "./practice-session.js";
import { SupplierDocumentRepository } from "./supplier-document-repository.js";
import { withTenant, type TenantTransaction } from "./tenant-context.js";

const base = z.object({
  version: z.literal("v2-inbound-mail.v1"), commandId: z.guid(),
  expectedVersion: z.number().int().nonnegative(),
}).strict();
export const inboundAddressCommand = base;
export const inboundReceiveCommand = base.extend({
  recipient: z.email().max(200), messageId: z.string().min(1).max(200),
  sender: z.email().max(200), subject: z.string().max(500), body: z.string().max(10000),
  fixtureId: z.string().max(100).optional(),
  // Metadata only. No attachment bytes, paths or URLs enter the practice catcher.
  attachments: z.array(z.object({ name: z.string().max(200) }).strict()).max(20).default([]),
});
export const inboundItemCommand = base.extend({
  itemId: z.guid(), action: z.enum(["file", "dismiss"]), jobId: z.guid().optional(),
}).superRefine((input, ctx) => {
  if (input.action === "file" && !input.jobId) ctx.addIssue({ code: "custom", message: "Choose a job", path: ["jobId"] });
});
// The authenticated practice session, as blank-practice-company.ts types it.
type Principal = Awaited<ReturnType<typeof authenticatePracticeSession>>;
type Item = { id: string; state: string; revision: number; fixture_id: string | null; job_id: string | null; document_id: string | null };
export class InboundMailError extends Error {
  constructor(readonly code: "NOT_FOUND" | "V2_ONLY" | "STALE_INBOUND" | "IDEMPOTENCY_CONFLICT" | "NEEDS_K6B" | "ITEM_CLOSED") { super(code); }
}
export function requireV2Inbound() {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") throw new InboundMailError("V2_ONLY");
}
const hash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export function practiceMailMatch(input: { sender: string; subject: string; body: string }, jobs: Array<{ id: string; supplier: boolean }>) {
  // This is the seed's invented merchant identity, not a real sender allowlist.
  if (input.sender.toLowerCase() !== "merchant@jobguard-v2.invalid") return null;
  const text = `${input.subject}\n${input.body}`.toLowerCase();
  const references: string[] = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gu) ?? [];
  const matched = jobs.filter(job => references.includes(job.id.toLowerCase()));
  if (references.length) return matched.length === 1 && new Set(references).size === 1 ? matched[0]!.id : null;
  const suppliers = jobs.filter(job => job.supplier);
  return suppliers.length === 1 ? suppliers[0]!.id : null;
}

/** Compose the unchanged intake's withTenant on this transaction. Only this private
 * adapter suppresses transaction ownership: errors escape to the outer rollback.
 * No business query, authorization or audit call is intercepted. */
function intakePool(pool: Pool, db: TenantTransaction): Pool {
  return new Proxy(pool, { get(target, key) {
    if (key === "connect") return async () => new Proxy(db.$client, { get(client, property) {
      if (property === "release") return () => undefined;
      if (property === "query") return async (sql: string, values?: unknown[]) => {
        if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [], rowCount: 0 };
        return client.query(sql, values);
      };
      const value = Reflect.get(client, property);
      return typeof value === "function" ? value.bind(client) : value;
    } });
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
export class V2InboundMailRepository {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(principal: Principal, work: (db: TenantTransaction) => Promise<T>) {
    requireV2Inbound();
    return withTenant(practiceMaterialPool(this.pool, principal.digest), principal.context, async db => {
      const actor = (await db.$client.query("SELECT app.current_actor() actor, app.current_firm_profile_key() firm")).rows[0];
      if (actor?.actor !== principal.membershipId || !String(actor.firm).startsWith("practice:")) throw new InboundMailError("NOT_FOUND");
      // Serialize this firm's commands before any job or audit lock.
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended(app.current_firm_profile_key(),2023))");
      return work(db);
    });
  }
  private async replay(db: TenantTransaction, commandId: string, input: unknown) {
    const row = (await db.$client.query("SELECT request_hash,result FROM app.v2_inbound_command WHERE command_id=$1", [commandId])).rows[0];
    if (row && row.request_hash !== hash(input)) throw new InboundMailError("IDEMPOTENCY_CONFLICT");
    return row?.result as Record<string, unknown> | undefined;
  }
  private async reserve(db: TenantTransaction, principal: Principal, commandId: string, input: unknown, result: Record<string, unknown>) {
    await db.$client.query(`INSERT INTO app.v2_inbound_command(tenant_id,firm_key,command_id,request_hash,result)
      VALUES($1,app.current_firm_profile_key(),$2,$3,$4::jsonb)`, [principal.context.tenantId, commandId, hash(input), JSON.stringify(result)]);
  }
  private async finish(db: TenantTransaction, principal: Principal, commandId: string, verb: string, subject: string, result: Record<string, unknown>) {
    // The receipt row and all domain rows are already locked before intake takes
    // the audit head. Finishing acquires no later contested business lock.
    await db.$client.query("UPDATE app.v2_inbound_command SET result=$2::jsonb WHERE command_id=$1",[commandId,JSON.stringify(result)]);
    await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${principal.membershipId}`,
      eventType: `v2.inbound.${verb}`, subjectType: "inbound_mail", subjectRef: subject,
      payload: { references: { commandId }, classifications: { action: "operational" } } }]);
    return result;
  }
  async view(principal: Principal) {
    return this.transaction(principal, async db => ({
      address: (await db.$client.query("SELECT address FROM app.v2_inbound_address")).rows[0]?.address ?? null,
      items: (await db.$client.query(`SELECT id,sender,subject,received_at,state,fixture_id,job_id,document_id,revision,filed_by FROM app.v2_inbound_item ORDER BY received_at,id`)).rows,
      jobs: (await db.$client.query("SELECT id,title FROM app.job WHERE status='live' ORDER BY title,id")).rows,
    }));
  }
  async address(principal: Principal, raw: unknown) {
    const input = inboundAddressCommand.parse(raw);
    return this.transaction(principal, async db => {
      const replay = await this.replay(db, input.commandId, input); if (replay) return replay;
      const prior = (await db.$client.query("SELECT address FROM app.v2_inbound_address")).rows[0];
      if (prior || input.expectedVersion !== 0) throw new InboundMailError("STALE_INBOUND");
      const address = `${randomBytes(18).toString("hex")}@inbound.jobguard-v2.invalid`;
      await db.$client.query(`INSERT INTO app.v2_inbound_address(tenant_id,firm_key,address,created_by) VALUES($1,app.current_firm_profile_key(),$2,$3)`, [principal.context.tenantId,address,principal.membershipId]);
      await this.reserve(db,principal,input.commandId,input,{address});
      return this.finish(db, principal, input.commandId, "address_created", input.commandId, { address });
    });
  }
  async receive(principal: Principal, raw: unknown) {
    const input = inboundReceiveCommand.parse(raw);
    return this.transaction(principal, async db => {
      const replay = await this.replay(db,input.commandId,input); if (replay) return replay;
      const address = (await db.$client.query("SELECT address FROM app.v2_inbound_address WHERE address=$1", [input.recipient.toLowerCase()])).rows[0];
      if (!address) throw new InboundMailError("NOT_FOUND");
      // A delivery identity binds its content, independent of the HTTP command ID.
      const { commandId: _id, expectedVersion: _revision, ...message } = input;
      const prior = (await db.$client.query("SELECT id,message_hash FROM app.v2_inbound_item WHERE message_id=$1",[input.messageId])).rows[0];
      if (prior) {
        if (prior.message_hash !== hash(message)) throw new InboundMailError("IDEMPOTENCY_CONFLICT");
        // Record this command's receipt too, so reusing its id for another request is refused.
        // No intake and no routing event: the delivery was already handled.
        const duplicate = { itemId: prior.id, duplicate: true };
        await this.reserve(db, principal, input.commandId, input, duplicate);
        return duplicate;
      }
      if (input.expectedVersion !== 0) throw new InboundMailError("STALE_INBOUND");
      const fixture = z.enum(supplierFixtureIds).safeParse(input.fixtureId);
      const needsK6B = !fixture.success || input.attachments.length > 0;
      const candidates = (await db.$client.query<{ id: string; supplier: boolean }>(`SELECT j.id,EXISTS(
        SELECT 1 FROM app.material_requirement r JOIN app.merchant_sku s ON(s.tenant_id,s.id)=(r.tenant_id,r.sku_id)
        JOIN app.merchant m ON(m.tenant_id,m.id)=(s.tenant_id,s.merchant_id)
        WHERE (r.tenant_id,r.job_id)=(j.tenant_id,j.id) AND m.name='Fictional Teacup Tile Merchant') supplier
        FROM app.job j WHERE j.status='live'`)).rows;
      const jobId = needsK6B ? null : practiceMailMatch(input,candidates);
      const id = randomUUID();
      await db.$client.query(`INSERT INTO app.v2_inbound_item(tenant_id,firm_key,id,message_id,message_hash,sender,subject,fixture_id,state)
        VALUES($1,app.current_firm_profile_key(),$2,$3,$4,$5,$6,$7,$8)`,
        [principal.context.tenantId,id,input.messageId,hash(message),input.sender,input.subject,fixture.success?fixture.data:null,needsK6B?"needs_k6b":"needs_job"]);
      // intake owns its own existing supplier_document.intake audit event. This
      // command adds exactly one v2.inbound.received event; both commit together.
      await this.reserve(db,principal,input.commandId,input,{itemId:id});
      const filed = jobId ? await this.file(db,principal,id,jobId,0) : null;
      return this.finish(db,principal,input.commandId,"received",id,{ itemId:id, state:filed?"filed":needsK6B?"needs_k6b":"needs_job", documentId:filed });
    });
  }
  private async file(db: TenantTransaction, principal: Principal, itemId: string, jobId: string, revision: number) {
    const item = (await db.$client.query<Item>("SELECT * FROM app.v2_inbound_item WHERE id=$1 FOR UPDATE",[itemId])).rows[0];
    const job = (await db.$client.query("SELECT id FROM app.job WHERE id=$1 AND status='live'",[jobId])).rows[0];
    if (!item || !job) throw new InboundMailError("NOT_FOUND");
    if (item.state === "needs_k6b" || !item.fixture_id) throw new InboundMailError("NEEDS_K6B");
    if (item.state !== "needs_job") throw new InboundMailError("ITEM_CLOSED");
    if (item.revision !== revision) throw new InboundMailError("STALE_INBOUND");
    const intakeRevision = Number((await db.$client.query("SELECT count(*) n FROM app.supplier_document_intake WHERE tenant_id=$1 AND job_id=$2",[principal.context.tenantId,jobId])).rows[0].n);
    const result = await new SupplierDocumentRepository(intakePool(this.pool,db)).intake(principal.context,jobId,{
      version:"supplier-document-intake.v1",commandId:itemId,fixtureId:z.enum(supplierFixtureIds).parse(item.fixture_id),
      channel:"fixture_mail",alias:"materials@fictional-builder.invalid",expectedRevision:intakeRevision,
    });
    await db.$client.query(`UPDATE app.v2_inbound_item SET state='filed',job_id=$2,document_id=$3,filed_by=$4,revision=revision+1 WHERE id=$1`,[itemId,jobId,result.documentId,principal.membershipId]);
    return result.documentId;
  }
  async command(principal: Principal, raw: unknown) {
    const input = inboundItemCommand.parse(raw);
    return this.transaction(principal, async db => {
      const replay=await this.replay(db,input.commandId,input); if(replay)return replay;
      await this.reserve(db,principal,input.commandId,input,{itemId:input.itemId});
      let documentId: string | null = null;
      if(input.action==="file") documentId=await this.file(db,principal,input.itemId,input.jobId!,input.expectedVersion);
      else {
        const item=(await db.$client.query<Item>("SELECT * FROM app.v2_inbound_item WHERE id=$1 FOR UPDATE",[input.itemId])).rows[0];
        if(!item)throw new InboundMailError("NOT_FOUND");
        if(item.revision!==input.expectedVersion)throw new InboundMailError("STALE_INBOUND");
        if(!["needs_job","needs_k6b"].includes(item.state))throw new InboundMailError("ITEM_CLOSED");
        await db.$client.query("UPDATE app.v2_inbound_item SET state='dismissed',revision=revision+1 WHERE id=$1",[input.itemId]);
      }
      return this.finish(db,principal,input.commandId,input.action==="file"?"filed":"dismissed",input.itemId,{itemId:input.itemId,documentId});
    });
  }
}
