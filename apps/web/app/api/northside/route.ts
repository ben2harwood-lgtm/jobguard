import "server-only";
import { northsideFacts, northsideTargets, seedNorthsideDemo } from "@jobguard/db";
import { DemoError, bodyOf, demoActor, failure, json, requireOrigin } from "../../lib/northside-server";

/** ENT-11a: who am I in the practice, and the counted facts about the generated contractor. */
export async function GET() {
  try {
    const { pool, member, role } = await demoActor();
    const facts = await northsideFacts(pool, member);
    return json({ version: "northside-summary.v1", environment: "synthetic_demo", realExternalActions: 0, role, seeded: facts.companyName !== null, targets: northsideTargets, facts });
  } catch (error) { return failure(error); }
}
/** Owner only: generate the contractor through the merged commands. Safe to repeat. */
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const body = await bodyOf(request);
    const { pool, member, role } = await demoActor();
    if (body.action !== "seed") throw new DemoError("INVALID_COMMAND", 422);
    if (role !== "owner") throw new DemoError("PERMISSION_DENIED", 403);
    await seedNorthsideDemo(pool, member);
    return json({ version: "northside-seeded.v1", environment: "synthetic_demo", realExternalActions: 0, facts: await northsideFacts(pool, member) });
  } catch (error) { return failure(error); }
}
