import "server-only";
import type { VerifiedTenantContext } from "@jobguard/db";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { ExtraApprovalRepository, northsideApprovalArtifact, northsideExtras, northsideRateCard, northsideRun, withTenant } from "@jobguard/db";
import { DemoError, bodyOf, demoActor, demoContext, failure, json, requireOrigin, parseDemoBody } from "../../../../../lib/northside-server";

const uuid = (value: unknown): string => { if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) return value.toLowerCase(); throw new DemoError("INVALID_COMMAND", 422); };
/** One route per step of the journey, each a thin call into the merged ENT-5b commands. The role gates here are only a courtesy: the database routines refuse anyone without the grant. */
export async function POST(request: Request, context: { params: Promise<{ extraId: string; action: string }> }) {
  try {
    requireOrigin(request);
    const { pool, member, role, sessionId } = await demoActor();
    const tenant: VerifiedTenantContext = await demoContext(pool, sessionId);
    const { extraId: rawExtra, action } = await context.params, extraId = uuid(rawExtra);
    const common = { version: z.literal("northside-command.v1"), jobId: z.guid({ error: "Invalid uuid" }), commandId: z.guid({ error: "Invalid uuid" }).optional() };
    if (action === "send" && role !== "owner") throw new DemoError("PERMISSION_DENIED", 403);
    const boundSchema = z.object({ ...common, requestId: z.guid({ error: "Invalid uuid" }), revisionHash: z.string().regex(/^[a-f0-9]{64}$/u), netPence: z.number().int().positive().max(1_000_000_000_000), stepIndex: z.number().int().nonnegative().optional() }).strict();
    const rejectSchema = boundSchema.extend({ stepIndex: z.number().int().min(0).max(20), reasonCode: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u) });
    const withdrawSchema = z.object({ ...common, reasonCode: z.enum(["not_done", "raised_in_error", "resident_cancelled", "already_on_order"]) }).strict();
    const body = action === "price" || action === "revise"
      ? parseDemoBody(z.object({ ...common, quantity: z.number().int().min(1).max(1000), sorCode: z.string().min(1).max(100) }).strict(), await bodyOf(request))
      : action === "reject" ? parseDemoBody(rejectSchema, await bodyOf(request))
      : action === "withdraw" ? parseDemoBody(withdrawSchema, await bodyOf(request))
      : action === "approve" || action === "send" ? parseDemoBody(boundSchema, await bodyOf(request))
      : parseDemoBody(z.object(common).strict(), await bodyOf(request));
    const jobId = uuid(body.jobId), commandId = body.commandId ?? randomUUID();
    const repo = new ExtraApprovalRepository(pool);
    const current = async () => { const found = (await northsideExtras(pool, member, role, tenant)).find(x => x.extraId === extraId && x.jobId === jobId); if (!found) throw new DemoError("NOT_FOUND", 404); return found; };
    if (action === "revise") {
      if (role !== "surveyor") throw new DemoError("PERMISSION_DENIED", 403);
      const price = parseDemoBody(z.object({ ...common, quantity: z.number().int().min(1).max(1000), sorCode: z.string().min(1).max(100) }).strict(), body);
      const allowed = await withTenant(pool, tenant, async db => (await db.$client.query<{ allowed: boolean }>(
        "SELECT app.xa_covers($1,ARRAY['surveyor']::text[],$2,'extra.price') IS NOT NULL AS allowed", [member.membershipId, jobId])).rows[0]?.allowed);
      if (!allowed) throw new DemoError("PERMISSION_DENIED", 403);
      const rate = (await northsideRateCard(pool, member, jobId, tenant)).find(r => r.code === price.sorCode);
      if (!rate) throw new DemoError("NOT_FOUND", 404);
      const netPence = rate.ratePence * price.quantity;
      return json({ version: "northside-revised.v1", environment: "synthetic_demo", realExternalActions: 0, netPence,
        result: await repo.reviseExtra(tenant, member, { version: "revise-extra.v1", commandId, jobId, extraId, netPence }) });
    }
    if (action === "withdraw") {
      if (!["supervisor", "surveyor", "commercial_manager"].includes(role)) throw new DemoError("PERMISSION_DENIED", 403);
      const { reasonCode } = parseDemoBody(withdrawSchema, body);
      return json({ version: "northside-withdrawn.v1", environment: "synthetic_demo", realExternalActions: 0,
        result: await repo.withdrawExtra(tenant, member, { version: "withdraw-extra.v1", commandId, jobId, extraId, reasonCode }) });
    }
    if (action === "reject") {
      const binding = parseDemoBody(rejectSchema, body);
      const queue = await repo.queue(tenant, member.membershipId);
      const eligible = queue.find(q => q.variation_id === extraId && q.job_id === jobId);
      // A completed rejection has left the queue. Only the same actor's existing command may reach
      // repository replay; begin_command still verifies current authority and the exact payload.
      const receipt = await withTenant(pool, tenant, async db => (await db.$client.query<{ extra_id: string; job_id: string }>(
        `SELECT q.variation_id extra_id,q.job_id FROM app.command_receipt r
         JOIN app.extra_approval_request q ON q.tenant_id=r.tenant_id AND q.id::text=r.result->>'requestId'
         WHERE r.tenant_id=$1 AND r.actor_membership_id=$3 AND r.command_type='RejectExtra' AND r.status='succeeded'
          AND (r.command_id=$2 OR (q.id=$4 AND r.result->>'stepIndex'=$5))`,
        [tenant.tenantId, commandId, member.membershipId, binding.requestId, String(binding.stepIndex)])).rows[0]);
      if (receipt && (receipt.extra_id !== extraId || receipt.job_id !== jobId)) throw new DemoError("COMMAND_CONFLICT", 409);
      if (!receipt) {
        if (!eligible) throw new DemoError("PERMISSION_DENIED", 403);
        const extra = await current();
        if (binding.requestId !== extra.requestId || binding.revisionHash !== extra.revisionHash || binding.netPence !== extra.netPence || binding.stepIndex !== extra.nextStepIndex || eligible.request_id !== extra.requestId || eligible.step_index !== extra.nextStepIndex) throw new DemoError("STALE_REVISION", 409);
      }
      return json({ version: "northside-rejected.v1", environment: "synthetic_demo", realExternalActions: 0,
        result: await repo.rejectExtra(tenant, member, { ...binding, version: "reject-extra.v1", commandId, jobId }) });
    }
    if (action === "price") {
      // The price is the seeded rate times the quantity the surveyor measured: whole pence, integer arithmetic.
      if (role !== "surveyor") throw new DemoError("PERMISSION_DENIED", 403);
      const price = body as typeof body & { quantity: number; sorCode: string };
      const quantity = price.quantity; if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000 || typeof price.sorCode !== "string") throw new DemoError("INVALID_COMMAND", 422);
      const allowed = await withTenant(pool, tenant, async db => (await db.$client.query<{ allowed: boolean }>(
        "SELECT app.xa_covers($1,ARRAY['surveyor']::text[],$2,'extra.price') IS NOT NULL AS allowed", [member.membershipId, jobId])).rows[0]?.allowed);
      if (!allowed) throw new DemoError("PERMISSION_DENIED", 403);
      const rate = (await northsideRateCard(pool, member, jobId, tenant)).find(r => r.code === price.sorCode); if (!rate) throw new DemoError("NOT_FOUND", 404);
      return json({ version: "northside-priced.v1", environment: "synthetic_demo", realExternalActions: 0, netPence: rate.ratePence * quantity, result: await repo.priceExtra(tenant, member, { version: "price-extra.v1", commandId, jobId, extraId, netPence: rate.ratePence * quantity }) });
    }
    if (action === "submit") return json({ version: "northside-submitted.v1", environment: "synthetic_demo", realExternalActions: 0, result: await repo.submitExtra(tenant, member, { version: "submit-extra.v1", commandId, jobId, extraId }) });
    if (action === "approve") {
      const binding = parseDemoBody(boundSchema.extend({ stepIndex: z.number().int().min(0).max(20) }), body);
      // A person repeating an approved step may no longer appear in the next-step queue.
      // Only an actor/type-scoped receipt bound to this URL permits the command replay path.
      const receipt = await withTenant(pool, tenant, async db => (await db.$client.query<{ extra_id: string; job_id: string }>(
        `SELECT q.variation_id extra_id,q.job_id FROM app.command_receipt r
         JOIN app.extra_approval_request q ON q.tenant_id=r.tenant_id AND q.id::text=r.result->>'requestId'
         WHERE r.tenant_id=$1 AND r.actor_membership_id=$3 AND r.command_type='ApproveExtraStep' AND r.status='succeeded'
          AND (r.command_id=$2 OR (q.id=$4 AND r.result->>'stepIndex'=$5))`,
        [tenant.tenantId, commandId, member.membershipId, binding.requestId, String(binding.stepIndex)])).rows[0]);
      if (receipt && (receipt.extra_id !== extraId || receipt.job_id !== jobId)) throw new DemoError("COMMAND_CONFLICT", 409);
      if (!receipt) {
        const queue = await repo.queue(tenant, member.membershipId);
        const eligible = queue.find(q => q.variation_id === extraId && q.job_id === jobId);
        if (!eligible) throw new DemoError("PERMISSION_DENIED", 403);
        const extra = await current();
        if (binding.requestId !== extra.requestId || binding.revisionHash !== extra.revisionHash || binding.netPence !== extra.netPence || binding.stepIndex !== extra.nextStepIndex || eligible.request_id !== extra.requestId || eligible.step_index !== extra.nextStepIndex) throw new DemoError("STALE_REVISION", 409);
      }
      return json({ version: "northside-approved.v1", environment: "synthetic_demo", realExternalActions: 0, result: await repo.approveExtraStep(tenant, member, { ...binding, version: "approve-extra-step.v1", commandId, jobId }) });
    }
    if (action === "send") {
      if (role !== "owner") throw new DemoError("PERMISSION_DENIED", 403);
      // Owner only (the merged command refuses anyone else). Practice: the message is queued to the fake adapter at a .invalid address and nothing leaves; the owner is shown the link.
      const binding = parseDemoBody(boundSchema, body);
      const extra = await current();
      if (binding.requestId !== extra.requestId || binding.revisionHash !== extra.revisionHash || binding.netPence !== extra.netPence) throw new DemoError("STALE_REVISION", 409);
      if (extra.requestId === null || extra.clientApproverMembershipId === null || extra.clientApproverEmail === null) throw new DemoError("INVALID_TRANSITION", 409);
      const run = await northsideRun(pool, member, tenant);
      if (!run) throw new DemoError("NOT_FOUND", 404);
      const recover = () => northsideApprovalArtifact(pool, member, tenant, commandId);
      const issue = async (prior: Awaited<ReturnType<typeof recover>>) => {
        if (prior && (prior.jobId !== jobId || prior.extraId !== extraId || prior.artifact.requestId !== binding.requestId || prior.revisionHash !== binding.revisionHash || prior.artifact.netPence !== binding.netPence || prior.approverMembershipId !== extra.clientApproverMembershipId || prior.artifact.recipient !== extra.clientApproverEmail)) throw new DemoError("COMMAND_CONFLICT", 409);
        const token = prior?.artifact.token ?? randomBytes(32).toString("base64url");
        const expiresAt = prior ? new Date(prior.artifact.expiresAt) : new Date(Date.now() + run.settings.linkLifetimeMinutes * 60_000);
        const sent = await repo.issueClientApproval(tenant, member, { version: "issue-client-approval.v1", commandId, jobId, requestId: extra.requestId, approverMembershipId: extra.clientApproverMembershipId, recipient: extra.clientApproverEmail, linkToken: token, expiresAt });
        return { token, sent };
      };
      const prior = await recover();
      let issued;
      try { issued = await issue(prior); }
      catch (error) {
        // Concurrent identical first requests may both generate inputs. Reuse the winner after its commit, once.
        if (prior || (error as { code?: string }).code !== "COMMAND_CONFLICT") throw error;
        const winner = await recover(); if (!winner) throw error;
        issued = await issue(winner);
      }
      const { token, sent } = issued;
      return json({ version: "northside-link.v1", environment: "synthetic_demo", realExternalActions: 0, recipient: extra.clientApproverEmail, path: `/extra-approval/${jobId}/${extra.requestId}#t=${token}`, result: sent });
    }
    throw new DemoError("NOT_FOUND", 404);
  } catch (error) { return failure(error); }
}

/** Revision controls need the current stored rates even when no logged extra remains on this job. */
export async function GET(_request: Request, context: { params: Promise<{ extraId: string; action: string }> }) {
  try {
    const { pool, member, role, sessionId } = await demoActor();
    const tenant: VerifiedTenantContext = await demoContext(pool, sessionId);
    const { extraId: rawExtra, action } = await context.params;
    if (action !== "revise") throw new DemoError("NOT_FOUND", 404);
    if (role !== "surveyor") throw new DemoError("PERMISSION_DENIED", 403);
    const extraId = uuid(rawExtra);
    const extra = (await northsideExtras(pool, member, role, tenant)).find(x => x.extraId === extraId);
    if (!extra) throw new DemoError("NOT_FOUND", 404);
    const allowed = await withTenant(pool, tenant, async db => (await db.$client.query<{ allowed: boolean }>(
      "SELECT app.xa_covers($1,ARRAY['surveyor']::text[],$2,'extra.price') IS NOT NULL AS allowed", [member.membershipId, extra.jobId])).rows[0]?.allowed);
    if (!allowed) throw new DemoError("PERMISSION_DENIED", 403);
    return json({ rates: await northsideRateCard(pool, member, extra.jobId, tenant) });
  } catch (error) { return failure(error); }
}
