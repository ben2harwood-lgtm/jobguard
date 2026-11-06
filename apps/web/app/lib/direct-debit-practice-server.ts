import "server-only";
import { cookies } from "next/headers";
import { DirectDebitPracticeApplication } from "@jobguard/api/direct-debit-practice";
import { authenticatePracticeSession, authorizePracticeJob, DirectDebitFixtureRepository, PracticeAccessError } from "@jobguard/db";
import { syntheticPool } from "./synthetic-server";
export async function directDebitPractice(jobId: string, raw?: unknown) {
  const pool = syntheticPool(), token = (await cookies()).get("jg_session")?.value;
  const auth = await authenticatePracticeSession(pool, token);
  const application = new DirectDebitPracticeApplication(new DirectDebitFixtureRepository(pool), async (actor, id) => {
    const current = await authorizePracticeJob(pool, token, id);
    if (current.context.tenantId !== auth.context.tenantId || current.membershipId !== actor.membershipId
      || current.identityUserId !== actor.identityUserId) throw new PracticeAccessError("NOT_FOUND");
  }, process.env.JOBGUARD_ENV);
  return application.execute(auth.context, { membershipId: auth.membershipId, identityUserId: auth.identityUserId }, jobId, raw);
}
