import type { Pool } from "pg";
import { z } from "zod";
import { PracticeWorkerSwitchError, practiceWorkerSwitchOnV1, practiceWorkerSwitchOffV1, practiceWorkerSwitchStateV1, type PracticeWorkerSwitchErrorCode } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext, type AuthenticatedMembership } from "./tenant-context.js";
import { appendAuditBatch } from "./audit.js";
import { derivedUuid } from "./work-order-repository.js";
const uuid = z.guid({ error: "Invalid uuid" });
const time = z.iso.datetime({ precision: 6, error: "Invalid datetime" });
const internalOn = z.object({ switch: uuid, session: uuid, owner: uuid, worker: uuid, startedAt: time, expiresAt: time, marker: z.enum(["acquired", "present"]), state: z.literal("acting"), replayed: z.boolean() }).strict();
const internalOff = z.object({ switch: uuid, session: uuid, owner: uuid, worker: uuid, endedAt: time, endReason: z.enum(["switched_back", "expired"]), endEvent: uuid, state: z.literal("owner"), replayed: z.boolean() }).strict();
const internalState = z.object({ state: z.enum(["owner", "acting", "unclosed"]), switch: uuid.nullable(), worker: uuid.nullable(), startedAt: time.nullable(), expiresAt: time.nullable() }).strict();
const publicState = (facts: Record<string, unknown>) => practiceWorkerSwitchStateV1.parse({ version: "practice-worker-switch-state.v1", environment: "synthetic_demo", realExternalActions: 0, state: "owner", switchId: null, workerMembershipId: null, startedAt: null, expiresAt: null, endedAt: null, endReason: null, ...facts });
const routineCodes: readonly PracticeWorkerSwitchErrorCode[] = ["MODE_FORBIDDEN", "UNAUTHENTICATED", "INVALID_COMMAND", "SWITCH_FORBIDDEN", "SWITCH_OPEN", "NOT_ACTING", "NOT_FOUND", "COMMAND_CONFLICT"];
function translated(error: unknown) {
 if (error instanceof PracticeWorkerSwitchError) return error;
 const message = error instanceof Error ? error.message : "";
 return new PracticeWorkerSwitchError(routineCodes.find(code => code === message) ?? "SWITCH_UNAVAILABLE");
}
export class PracticeWorkerSwitchRepository {
 constructor(private readonly pool: Pool) {}
 async switchOn(context: VerifiedTenantContext, actor: AuthenticatedMembership, sessionId: string, raw: unknown) {
  if (actor.tenantId.toLowerCase() !== context.tenantId.toLowerCase()) throw new PracticeWorkerSwitchError("UNAUTHENTICATED");
  const target = z.object({ workerId: uuid }).passthrough().safeParse(raw);
  const command = practiceWorkerSwitchOnV1.safeParse(target.success ? Object.fromEntries(Object.entries(target.data).filter(([name]) => name !== "workerId")) : undefined);
  if (!target.success || !command.success) throw new PracticeWorkerSwitchError("INVALID_COMMAND");
  try {
   return await withTenant(this.pool, context, async db => {
    const response = (await db.$client.query("SELECT app.practice_worker_switch_on($1,$2,$3) result", [sessionId, command.data.commandId, target.data.workerId])).rows[0]?.result;
    const parsed = internalOn.safeParse(response); if (!parsed.success) throw new PracticeWorkerSwitchError("SWITCH_UNAVAILABLE");
    const result = parsed.data;
    if (!result.replayed) await appendAuditBatch(db, [{ id: result.switch, version: "audit.v1", eventType: "practice.worker_switch.started", subjectType: "practice-worker-switch", subjectRef: result.switch, actorRef: `membership:${result.owner}`, payload: { references: { switch: result.switch, session: result.session, command: command.data.commandId, owner: result.owner, worker: result.worker, marker: result.marker, environment: "synthetic_demo" }, classifications: { action: "security" } } }]);
    return publicState({ state: result.state, switchId: result.switch, workerMembershipId: result.worker, startedAt: result.startedAt, expiresAt: result.expiresAt });
   });
  } catch (error) {
   const failure = translated(error);
   if (failure.code === "SWITCH_FORBIDDEN" || failure.code === "NOT_FOUND") await this.refusal(context, actor, command.data.commandId, target.data.workerId, failure.code);
   throw failure;
  }
 }
 async switchOff(context: VerifiedTenantContext, actor: AuthenticatedMembership, sessionId: string, raw: unknown) {
  if (actor.tenantId.toLowerCase() !== context.tenantId.toLowerCase()) throw new PracticeWorkerSwitchError("UNAUTHENTICATED");
  const command = practiceWorkerSwitchOffV1.safeParse(raw); if (!command.success) throw new PracticeWorkerSwitchError("INVALID_COMMAND");
  try {
   return await withTenant(this.pool, context, async db => {
    const response = (await db.$client.query("SELECT app.practice_worker_switch_off($1,$2) result", [sessionId, command.data.commandId])).rows[0]?.result;
    const parsed = internalOff.safeParse(response); if (!parsed.success) throw new PracticeWorkerSwitchError("SWITCH_UNAVAILABLE");
    const result = parsed.data;
    if (!result.replayed) await appendAuditBatch(db, [{ id: result.endEvent, version: "audit.v1", eventType: "practice.worker_switch.ended", subjectType: "practice-worker-switch", subjectRef: result.switch, actorRef: `membership:${result.owner}`, payload: { references: { switch: result.switch, session: result.session, command: command.data.commandId, owner: result.owner, worker: result.worker, reason: result.endReason, environment: "synthetic_demo" }, classifications: { action: "security" } } }]);
    return publicState({ state: result.state, switchId: result.switch, workerMembershipId: result.worker, endedAt: result.endedAt, endReason: result.endReason });
   });
  } catch (error) { throw translated(error); }
 }
 async state(context: VerifiedTenantContext, sessionId: string) {
  try {
   return await withTenant(this.pool, context, async db => {
    const parsed = internalState.safeParse((await db.$client.query("SELECT app.practice_worker_switch_state($1) result", [sessionId])).rows[0]?.result);
    if (!parsed.success) throw new PracticeWorkerSwitchError("SWITCH_UNAVAILABLE");
    return publicState({ state: parsed.data.state, switchId: parsed.data.switch, workerMembershipId: parsed.data.worker, startedAt: parsed.data.startedAt, expiresAt: parsed.data.expiresAt });
   });
  } catch (error) { throw translated(error); }
 }
 private async refusal(context: VerifiedTenantContext, actor: AuthenticatedMembership, commandId: string, workerId: string, code: "SWITCH_FORBIDDEN" | "NOT_FOUND") {
  const reason = code === "SWITCH_FORBIDDEN" ? "switch_forbidden" : "worker_not_eligible";
  try {
   await withTenant(this.pool, context, async db => {
    // This lock and every membership read precede the final audit-head lock.
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,16502))", [commandId]);
    const id = derivedUuid(`worker-switch-refusal:${context.tenantId}:${commandId}:${reason}`);
    if ((await db.$client.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND id=$2", [context.tenantId, id])).rowCount) return;
    const validActor = (await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3", [context.tenantId, actor.membershipId, actor.identityUserId])).rowCount;
    const validWorker = (await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2", [context.tenantId, workerId])).rowCount;
    await appendAuditBatch(db, [{ id, version: "audit.v1", eventType: "practice.worker_switch.refused", subjectType: "practice-worker-switch-command", subjectRef: commandId, actorRef: validActor ? `membership:${actor.membershipId}` : "security:unverified-member", payload: { references: { command: commandId, reason, environment: "synthetic_demo", ...(validWorker ? { worker: workerId } : {}) }, classifications: { action: "security" } } }]);
   });
  } catch { /* The original refusal remains the only public answer. */ }
 }
}
