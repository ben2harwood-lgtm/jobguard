import "server-only";
import { northsideExtras, northsideRateCard, type NorthsideRate } from "@jobguard/db";
import { demoActor, failure, json } from "../../../lib/northside-server";

/** The extras this signed-in member may see, read from the stored rows, plus (for a surveyor) the seeded rate card of each job. */
export async function GET() {
  try {
    const { pool, member, role } = await demoActor();
    const extras = await northsideExtras(pool, member, role);
    const rates: Record<string, NorthsideRate[]> = {};
    if (role === "surveyor") for (const extra of extras) if (extra.state === "logged" && !rates[extra.jobId]) rates[extra.jobId] = await northsideRateCard(pool, member, extra.jobId);
    return json({ version: "northside-extras.v1", environment: "synthetic_demo", realExternalActions: 0, role, extras, rates });
  } catch (error) { return failure(error); }
}
