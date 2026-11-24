import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { dunningInvoiceV1, dunningSuppression } from "@jobguard/core";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { authorizePracticeJob } from "./practice-session.js";
import { withTenant, type TenantTransaction } from "./tenant-context.js";
import { assertV2Recipient, captureV2Delivery } from "./v2-local-catcher.js";
import { chaseCommand, chaseMessage, nextChase, requireV2Chasing, V2ChaseError, type ChaseItem } from "./v2-chase-policy.js";

type Setting = { enabled: boolean; revision: number };
type Log = { kind: string; item_id: string; step: number; stopped_reason: string | null;
  due_at: Date | null; sent_at: Date | null; message: string | null };
interface State { setting: Setting; firm: string; items: ChaseItem[]; log: Log[]; }
const recipient = "customer@jobguard-v2.invalid";

/** Local, fictional catcher only. No provider, fee or payment execution authority. */
export class V2ChaseRepository {
  constructor(private readonly pool: Pool, private readonly clock: () => number = Date.now) {}

  private async access(token: string | undefined, jobId: string) {
    requireV2Chasing();
    if (!z.guid().safeParse(jobId).success) throw new V2ChaseError("CHASE_INVALID");
    return authorizePracticeJob(this.pool, token, jobId);
  }

  private async state(db: TenantTransaction, tenant: string, job: string, now: number): Promise<State> {
    const setting = (await db.$client.query<Setting>(`SELECT enabled,revision FROM app.v2_chase_setting
      WHERE tenant_id=$1 AND firm_key=app.current_firm_profile_key()`, [tenant])).rows[0] ?? { enabled: false, revision: 0 };
    const firm = (await db.$client.query<{ name: string | null }>("SELECT app.job_saved_firm_name($1) name", [job])).rows[0]?.name;
    const log = (await db.$client.query<Log>(`SELECT kind,item_id,step,stopped_reason,due_at,sent_at,message FROM app.v2_chase_log
      WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,kind,item_id,step`, [tenant, job])).rows;
    const quotes = (await db.$client.query<{ id: string; reference: string; total: string; anchor: Date; stopped: boolean }>(`
      SELECT d.id,d.reference,q.total_pence::text total,min(s.issued_at) anchor,
        (EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=d.tenant_id AND e.job_id=d.job_id AND e.document_id=d.id)
         OR EXISTS(SELECT 1 FROM app.quote_acceptance a WHERE a.tenant_id=d.tenant_id AND a.job_id=d.job_id AND a.document_id=d.id)
         OR EXISTS(SELECT 1 FROM app.quote_send newer JOIN app.quote_document_version nd ON(nd.tenant_id,nd.id)=(newer.tenant_id,newer.document_id)
           WHERE newer.tenant_id=d.tenant_id AND newer.job_id=d.job_id AND nd.document_version>d.document_version)) stopped
      FROM app.quote_document_version d JOIN app.quote_revision q ON(q.tenant_id,q.job_id,q.id)=(d.tenant_id,d.job_id,d.quote_revision_id)
      JOIN app.quote_send s ON(s.tenant_id,s.job_id,s.document_id)=(d.tenant_id,d.job_id,d.id)
      JOIN app.action_outbox o ON(o.tenant_id,o.id)=(s.tenant_id,s.outbox_action_id) AND o.status='succeeded'
      WHERE d.tenant_id=$1 AND d.job_id=$2 AND s.recipients=$3::jsonb
      GROUP BY d.id,d.tenant_id,d.job_id,d.document_version,d.reference,q.total_pence`, [tenant, job, JSON.stringify([recipient])])).rows;
    const items: ChaseItem[] = quotes.map(q => ({ id: q.id, kind: "quote", reference: q.reference,
      amountPence: Number(q.total), anchor: q.anchor.getTime(), recipient, stoppedReason: q.stopped ? "decision" : null }));
    const metadata = (await db.$client.query<{ invoice_id: string; projection: unknown }>(
      "SELECT * FROM app.v2_chase_invoice_metadata($1)", [job])).rows;
    const invoices = (await db.$client.query<{ id: string; reference: string; balance: string; total: string; source_hash: string; pilot: boolean }>(`
      SELECT i.id,i.invoice_number reference,i.total_pence::text total,i.source_hash,
       (i.total_pence-coalesce((SELECT sum(c.amount_pence) FROM app.customer_credit_note c
         WHERE(c.tenant_id,c.invoice_id)=(i.tenant_id,i.id)),0)
        -coalesce((SELECT sum(p.amount_pence) FROM app.customer_payment p WHERE(p.tenant_id,p.invoice_id)=(i.tenant_id,i.id)
         AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE(r.tenant_id,r.payment_id)=(p.tenant_id,p.id))),0))::text balance,
       EXISTS(SELECT 1 FROM app.job_activation a WHERE(a.tenant_id,a.job_id)=(i.tenant_id,i.job_id) AND a.mode='pilot_no_charge') pilot
      FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2`, [tenant, job])).rows;
    for (const invoice of invoices) {
      const parsed = dunningInvoiceV1.safeParse(metadata.find(row => row.invoice_id === invoice.id)?.projection);
      const source = parsed.success ? parsed.data : null;
      const trusted = source && source.tenantId === tenant && source.jobId === job && source.invoiceId === invoice.id
        && source.category === "customer" && source.sourceState === "issued_invoice" && source.recipient === recipient
        && source.sourceHash === invoice.source_hash.trim() && source.originalPence === Number(invoice.total) && source.outstandingPence === Number(invoice.balance);
      items.push({ id: invoice.id, kind: "invoice", reference: invoice.reference, amountPence: Number(invoice.balance),
        anchor: trusted ? source.dueTick : 0, recipient,
        stoppedReason: invoice.pilot ? "pilot_no_charge" : Number(invoice.balance) <= 0 ? "paid"
          : trusted ? dunningSuppression(source, Math.max(now, source.dueTick)) : "missing_current_due_or_dispute_facts" });
    }
    for (const item of items) {
      const stopped = log.find(row => row.kind === item.kind && row.item_id === item.id && row.step === 0);
      if (stopped) item.stoppedReason = stopped.stopped_reason;
    }
    return { setting, firm: firm ?? "", items, log };
  }

  async read(token: string | undefined, jobId: string) {
    const auth = await this.access(token, jobId);
    return withTenant(this.pool, auth.context, async db => {
      const state = await this.state(db, auth.context.tenantId, jobId, this.clock());
      return { version: "v2-chase-view.v1", ...state.setting, synthetic: true, items: state.items.map(item => ({
        ...item, next: state.setting.enabled ? nextChase(item, state.log.filter(row => row.kind === item.kind && row.item_id === item.id).map(row => row.step)) : null,
      })), log: state.log };
    });
  }

  async command(token: string | undefined, jobId: string, raw: unknown) {
    const auth = await this.access(token, jobId), parsed = chaseCommand.safeParse(raw);
    if (!parsed.success) throw new V2ChaseError("CHASE_INVALID");
    const input = parsed.data, now = this.clock();
    if (!Number.isSafeInteger(now) || now < 0) throw new V2ChaseError("CHASE_INVALID");
    const result = await withTenant(this.pool, auth.context, async db => {
      const tenant = auth.context.tenantId;
      // One firm lock before state, command, source and audit locks. Off and runs serialize.
      const scope = (await db.$client.query<{ key: string | null; actor: string; database: string }>(
        "SELECT app.current_firm_profile_key() key,app.current_actor() actor,current_database() database")).rows[0]!;
      if (!scope.key?.startsWith("practice:") || scope.database !== "jobguard_v2_local" || scope.actor !== auth.membershipId)
        throw new V2ChaseError("CHASE_UNAVAILABLE");
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,2019))", [tenant + ":" + scope.key]);
      const owner = (await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=app.current_actor() AND role='owner'", [tenant])).rowCount;
      if (!owner) throw new V2ChaseError("CHASE_UNAVAILABLE");
      const requestHash = createHash("sha256").update(JSON.stringify({ jobId, actor: auth.membershipId, input })).digest("hex");
      const prior = (await db.$client.query<{ request_hash: string; result: { captured: number; revision: number } }>(`
        SELECT request_hash,result FROM app.v2_chase_command WHERE tenant_id=$1 AND firm_key=$2 AND command_id=$3`,
      [tenant, scope.key, input.commandId])).rows[0];
      if (prior) {
        if (prior.request_hash !== requestHash) throw new V2ChaseError("CHASE_CONFLICT");
        return { ...prior.result, replayed: true };
      }
      const state = await this.state(db, tenant, jobId, now);
      if (state.setting.revision !== input.expectedVersion) throw new V2ChaseError("CHASE_CONFLICT");
      const events: AuditEventInput[] = [];
      const event = (verb: string, subject: string, refs: Record<string, string> = {}) => events.push({
        id: randomUUID(), version: "audit.v1", actorRef: `membership:${auth.membershipId}`, eventType: `v2.chase.${verb}`,
        subjectType: "job", subjectRef: subject, payload: { references: { commandId: input.commandId, ...refs } },
      });
      let captured = 0, revision = state.setting.revision;
      if (input.action === "setting") {
        revision++;
        await db.$client.query(`INSERT INTO app.v2_chase_setting(tenant_id,firm_key,enabled,revision,actor_membership_id)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,firm_key) DO UPDATE SET enabled=excluded.enabled,
          revision=excluded.revision,actor_membership_id=excluded.actor_membership_id,changed_at=transaction_timestamp()`,
        [tenant, scope.key, input.enabled, revision, auth.membershipId]);
      } else if (input.action === "stop") {
        const item = state.items.find(row => row.id === input.itemId && row.kind === input.kind);
        if (!item || revision === 0) throw new V2ChaseError("CHASE_UNAVAILABLE");
        await this.record(db, tenant, scope.key, jobId, item, 0, null, input.commandId, auth.membershipId, now, input.reason);
      } else if (state.setting.enabled) {
        if (!state.firm) throw new V2ChaseError("CHASE_UNAVAILABLE");
        for (const item of state.items) {
          if (item.stoppedReason && !["missing_current_due_or_dispute_facts", "reconcile_attempt"].includes(item.stoppedReason)) {
            await this.record(db, tenant, scope.key, jobId, item, 0, null, input.commandId, auth.membershipId, now, item.stoppedReason);
          }
          const next = nextChase(item, state.log.filter(row => row.item_id === item.id && row.kind === item.kind).map(row => row.step));
          if (!next || Date.parse(next.due) > now) continue;
          assertV2Recipient(item.recipient);
          await this.record(db, tenant, scope.key, jobId, item, next.step, next.due, input.commandId, auth.membershipId, now, null, chaseMessage(state.firm, item));
          captured++;
          event("captured", jobId, { itemId: item.id, step: String(next.step) });
        }
      }
      const receipt = { captured, revision };
      await db.$client.query(`INSERT INTO app.v2_chase_command(tenant_id,firm_key,job_id,command_id,request_hash,result,actor_membership_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [tenant, scope.key, jobId, input.commandId, requestHash, receipt, auth.membershipId]);
      event(input.action, jobId);
      await appendAuditBatch(db, events); // Final lock, and rollback covers every row and event.
      return { ...receipt, replayed: false };
    });
    if (!result.replayed) for (let i = 0; i < result.captured; i++) captureV2Delivery("v2.chase", recipient);
    return result;
  }

  private async record(db: TenantTransaction, tenant: string, firm: string, job: string, item: ChaseItem, step: number,
    due: string | null, command: string, actor: string, now: number, reason: string | null, message: string | null = null) {
    await db.$client.query(`INSERT INTO app.v2_chase_log(tenant_id,firm_key,job_id,kind,item_id,quote_id,invoice_id,
      step,due_at,sent_at,stopped_reason,recipient,message,command_id,actor_membership_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ${step === 0 ? "ON CONFLICT DO NOTHING" : ""}`,
    [tenant, firm, job, item.kind, item.id, item.kind === "quote" ? item.id : null, item.kind === "invoice" ? item.id : null,
      step, due, step ? new Date(now) : null, reason, step ? recipient : null, message, command, actor]);
  }
}
