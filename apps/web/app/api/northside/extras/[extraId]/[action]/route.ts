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
    const common = { version: z.literal("northside-command.v1"), jobId: z.string().uuid(), commandId: z.string().uuid().optional() };
    if (action === "send" && role !== "owner") throw new DemoError("PERMISSION_DENIED", 403);
    const boundSchema = z.object({ ...common, requestId: z.string().uuid(), revisionHash: z.string().regex(/^[a-f0-9]{64}$/u), netPence: z.number().int().positive().max(1_000_000_000_000), stepIndex: z.number().int().nonnegative().optional() }).strict();
    const body = action === "price"
      ? parseDemoBody(z.object({ ...common, quantity: z.number().int().min(1).max(1000), sorCode: z.string().min(1).max(100) }).strict(), await bodyOf(request))
      : action === "approve" || action === "send" ? parseDemoBody(boundSchema, await bodyOf(request))
      : parseDemoBody(z.object(common).strict(), await bodyOf(request));
    const jobId = uuid(body.jobId), commandId = body.commandId ?? randomUUID();
    const repo = new ExtraApprovalRepository(pool);
    const current = async () => { const found = (await northsideExtras(pool, member, role, tenant)).find(x => x.extraId === extraId && x.jobId === jobId); if (!found) throw new DemoError("NOT_FOUND", 404); return found; };
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
      const binding = parseDemoBody(boundSchema, body);
      const queue = await repo.queue(tenant, member.membershipId);
      const eligible = queue.find(q => q.variation_id === extraId && q.job_id === jobId);
      if (!eligible) throw new DemoError("PERMISSION_DENIED", 403);
      const extra = await current();
      if (binding.requestId !== extra.requestId || binding.revisionHash !== extra.revisionHash || binding.netPence !== extra.netPence || binding.stepIndex !== extra.nextStepIndex || eligible.request_id !== extra.requestId || eligible.step_index !== extra.nextStepIndex) throw new DemoError("STALE_REVISION", 409);
      if (extra.requestId === null || extra.revisionHash === null || extra.netPence === null || extra.nextStepIndex === null) throw new DemoError("INVALID_TRANSITION", 409);
      return json({ version: "northside-approved.v1", environment: "synthetic_demo", realExternalActions: 0, result: await repo.approveExtraStep(tenant, member, { version: "approve-extra-step.v1", commandId, jobId, requestId: extra.requestId, stepIndex: extra.nextStepIndex, revisionHash: extra.revisionHash, netPence: extra.netPence }) });
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
