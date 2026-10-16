import "server-only";
import type { VerifiedTenantContext } from "@jobguard/db";
import { z } from "zod";
import { northsideFacts, northsideTargets, seedNorthsideDemo, northsideRun, northsideSwitchTargets, northsideOwnActions } from "@jobguard/db";
import { DemoError, bodyOf, demoActor, demoContext, failure, json, requireOrigin, parseDemoBody } from "../../lib/northside-server";

/** ENT-11a: who am I in the practice, and the counted facts about the generated contractor. */
export async function GET() {
  try {
    const { pool, member, role, sessionId } = await demoActor();
    const context: VerifiedTenantContext = await demoContext(pool, sessionId);
    const run = await northsideRun(pool, member, context);
    const facts = role === "owner" ? await northsideFacts(pool, member, context) : null;
    return json({ ...run, membershipId: member.membershipId, targetsToSwitch: run ? await northsideSwitchTargets(pool, member, context) : [],
      recentActions: run ? await northsideOwnActions(pool, member, context) : [], version: "northside-summary.v1", environment: "synthetic_demo", realExternalActions: 0, role, seeded: !!run && (facts === null || facts.companyName !== null), targets: northsideTargets, facts });
  } catch (error) { return failure(error); }
}
/** Owner only: generate the contractor through the merged commands. Safe to repeat. */
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const { pool, member, role, sessionId } = await demoActor();
    const context: VerifiedTenantContext = await demoContext(pool, sessionId);
    const body = parseDemoBody(z.object({ version: z.literal("northside-command.v1"), action: z.literal("seed") }).strict(), await bodyOf(request));
    if (body.action !== "seed") throw new DemoError("INVALID_COMMAND", 422);
    if (role !== "owner") throw new DemoError("PERMISSION_DENIED", 403);
    await seedNorthsideDemo(pool, member, context);
    return json({ version: "northside-seeded.v1", environment: "synthetic_demo", realExternalActions: 0, facts: await northsideFacts(pool, member, context) });
  } catch (error) { return failure(error); }
}
