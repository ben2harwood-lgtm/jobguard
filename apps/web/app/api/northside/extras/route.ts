import "server-only";
import type { VerifiedTenantContext } from "@jobguard/db";
import { ExtraApprovalRepository, northsideLocalLinks, northsideRun, northsideExtras, northsideRateCard, type NorthsideRate } from "@jobguard/db";
import { demoActor, demoContext, failure, json } from "../../../lib/northside-server";

/** The extras this signed-in member may see, read from the stored rows, plus (for a surveyor) the seeded rate card of each job. */
export async function GET() {
  try {
    const { pool, member, role, sessionId } = await demoActor();
    const context: VerifiedTenantContext = await demoContext(pool, sessionId);
    const extras = await northsideExtras(pool, member, role, context);
    const rates: Record<string, NorthsideRate[]> = {};
    if (role === "surveyor") for (const extra of extras) if (extra.state === "logged" && !rates[extra.jobId]) rates[extra.jobId] = await northsideRateCard(pool, member, extra.jobId, context);
    const queue = await new ExtraApprovalRepository(pool).queue(context, member.membershipId);
    return json({ settings: await northsideRun(pool, member, context), queue, localLinks: role === "owner" ? await northsideLocalLinks(pool, member, context) : [], version: "northside-extras.v1", environment: "synthetic_demo", realExternalActions: 0, role, extras, rates });
  } catch (error) { return failure(error); }
}
