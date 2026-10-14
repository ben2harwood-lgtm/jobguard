import "server-only";
import { randomUUID } from "node:crypto";
import { ExtraApprovalRepository } from "@jobguard/db";
import { DemoError, bodyOf, demoActor, failure, json, requireOrigin } from "../../../lib/northside-server";

/** The signed-in client approver's two calls: read what the link is for, and decide. The merged repository checks the link, the email and the grant. */
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const body = await bodyOf(request);
    const { pool, member, context, role } = await demoActor();
    if (role !== "client_approver") throw new DemoError("PERMISSION_DENIED", 403);
    const repo = new ExtraApprovalRepository(pool);
    const common = { jobId: body.jobId, requestId: body.requestId, linkToken: body.token, email: body.email };
    if (body.action === "view") return json({ environment: "synthetic_demo", realExternalActions: 0, view: await repo.clientApprovalView(context, member, { version: "client-approval-view.v1", ...common }) });
    if (body.action === "decide") {
      const result = await repo.decideClientApproval(context, member, { version: "decide-client-approval.v1", commandId: typeof body.commandId === "string" ? body.commandId : randomUUID(), ...common,
        revisionHash: body.revisionHash, netPence: body.netPence, decision: body.decision, ...(typeof body.reasonCode === "string" ? { reasonCode: body.reasonCode } : {}), fictionalRoleName: body.fictionalRoleName, actualTesterReference: body.actualTesterReference });
      return json({ environment: "synthetic_demo", realExternalActions: 0, result });
    }
    throw new DemoError("INVALID_COMMAND", 422);
  } catch (error) { return failure(error); }
}
