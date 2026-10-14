import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { ExtraApprovalRepository, northsideExtras, northsideRateCard } from "@jobguard/db";
import { DemoError, bodyOf, demoActor, failure, json, requireOrigin } from "../../../../../lib/northside-server";

const uuid = (value: unknown): string => { if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) return value.toLowerCase(); throw new DemoError("INVALID_COMMAND", 422); };
/** One route per step of the journey, each a thin call into the merged ENT-5b commands. The role gates here are only a courtesy: the database routines refuse anyone without the grant. */
export async function POST(request: Request, context: { params: Promise<{ extraId: string; action: string }> }) {
  try {
    requireOrigin(request);
    const { extraId: rawExtra, action } = await context.params, extraId = uuid(rawExtra), body = await bodyOf(request);
    const jobId = uuid(body.jobId), commandId = body.commandId === undefined ? randomUUID() : uuid(body.commandId);
    const { pool, member, context: tenant, role } = await demoActor();
    const repo = new ExtraApprovalRepository(pool);
    const current = async () => { const found = (await northsideExtras(pool, member, role)).find(x => x.extraId === extraId && x.jobId === jobId); if (!found) throw new DemoError("NOT_FOUND", 404); return found; };
    if (action === "price") {
      // The price is the seeded rate times the quantity the surveyor measured: whole pence, integer arithmetic.
      if (role !== "surveyor") throw new DemoError("PERMISSION_DENIED", 403);
      const quantity = body.quantity; if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000 || typeof body.sorCode !== "string") throw new DemoError("INVALID_COMMAND", 422);
      const rate = (await northsideRateCard(pool, member, jobId)).find(r => r.code === body.sorCode); if (!rate) throw new DemoError("NOT_FOUND", 404);
      return json({ version: "northside-priced.v1", environment: "synthetic_demo", realExternalActions: 0, netPence: rate.ratePence * quantity, result: await repo.priceExtra(tenant, member, { version: "price-extra.v1", commandId, jobId, extraId, netPence: rate.ratePence * quantity }) });
    }
    if (action === "submit") return json({ version: "northside-submitted.v1", environment: "synthetic_demo", realExternalActions: 0, result: await repo.submitExtra(tenant, member, { version: "submit-extra.v1", commandId, jobId, extraId }) });
    if (action === "approve") {
      const extra = await current();
      if (extra.requestId === null || extra.revisionHash === null || extra.netPence === null || extra.nextStepIndex === null) throw new DemoError("INVALID_TRANSITION", 409);
      return json({ version: "northside-approved.v1", environment: "synthetic_demo", realExternalActions: 0, result: await repo.approveExtraStep(tenant, member, { version: "approve-extra-step.v1", commandId, jobId, requestId: extra.requestId, stepIndex: extra.nextStepIndex, revisionHash: extra.revisionHash, netPence: extra.netPence }) });
    }
    if (action === "send") {
      // Owner only (the merged command refuses anyone else). Practice: the message is queued to the fake adapter at a .invalid address and nothing leaves; the owner is shown the link.
      const extra = await current();
      if (extra.requestId === null || extra.clientApproverMembershipId === null || extra.clientApproverEmail === null) throw new DemoError("INVALID_TRANSITION", 409);
      const token = randomBytes(32).toString("base64url");
      const sent = await repo.issueClientApproval(tenant, member, { version: "issue-client-approval.v1", commandId, jobId, requestId: extra.requestId, approverMembershipId: extra.clientApproverMembershipId, recipient: extra.clientApproverEmail, linkToken: token, expiresAt: new Date(Date.now() + 24 * 3_600_000) });
      return json({ version: "northside-link.v1", environment: "synthetic_demo", realExternalActions: 0, recipient: extra.clientApproverEmail, path: `/extra-approval/${jobId}/${extra.requestId}#t=${token}`, result: sent });
    }
    throw new DemoError("NOT_FOUND", 404);
  } catch (error) { return failure(error); }
}
