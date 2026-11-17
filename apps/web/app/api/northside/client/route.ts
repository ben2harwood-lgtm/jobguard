import "server-only";
import type { VerifiedTenantContext } from "@jobguard/db";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ExtraApprovalRepository, northsideRun } from "@jobguard/db";
import { DemoError, bodyOf, demoActor, demoContext, failure, json, requireOrigin, parseDemoBody } from "../../../lib/northside-server";

/** The signed-in client approver's two calls: read what the link is for, and decide. The merged repository checks the link, the email and the grant. */
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const { pool, member, role, sessionId } = await demoActor();
    const context: VerifiedTenantContext = await demoContext(pool, sessionId);
    const commonFields = { version: z.literal("northside-command.v1"), jobId: z.guid({ error: "Invalid uuid" }), requestId: z.guid({ error: "Invalid uuid" }), token: z.string().min(16).max(200), email: z.email({ error: "Invalid email" }) };
    const body = parseDemoBody(z.discriminatedUnion("action", [
      z.object({ action: z.literal("view"), ...commonFields }).strict(),
      z.object({ action: z.literal("decide"), ...commonFields, commandId: z.guid({ error: "Invalid uuid" }).optional(), revisionHash: z.string().regex(/^[a-f0-9]{64}$/u),
        netPence: z.number().int().positive().max(1_000_000_000_000), decision: z.enum(["approve", "reject"]), reasonCode: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u).optional() }).strict(),
    ]), await bodyOf(request));
    if (role !== "client_approver") throw new DemoError("PERMISSION_DENIED", 403);
    const repo = new ExtraApprovalRepository(pool);
    const common = { jobId: body.jobId, requestId: body.requestId, linkToken: body.token, email: body.email };
    if (body.action === "view") return json({ environment: "synthetic_demo", realExternalActions: 0, view: await repo.clientApprovalView(context, member, { version: "client-approval-view.v1", ...common }) });
    if (body.action === "decide") {
      const run = await northsideRun(pool, member, context);
      if (!run) throw new DemoError("NOT_FOUND", 404);
      const result = await repo.decideClientApproval(context, member, { version: "decide-client-approval.v1", commandId: typeof body.commandId === "string" ? body.commandId : randomUUID(), ...common,
        revisionHash: body.revisionHash, netPence: body.netPence, decision: body.decision, ...(typeof body.reasonCode === "string" ? { reasonCode: body.reasonCode } : {}), fictionalRoleName: "Fictional client approver", actualTesterReference: `membership:${run.testerMembershipId}` });
      return json({ environment: "synthetic_demo", realExternalActions: 0, result });
    }
    throw new DemoError("INVALID_COMMAND", 422);
  } catch (error) { return failure(error); }
}
