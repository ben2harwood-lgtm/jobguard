import { cookies } from "next/headers";
import { authenticatePracticeSession } from "@jobguard/db";
import { JobGuardApp } from "../ui/jobguard-app";
import { IdentitySignIn } from "../sign-in/sign-in";
import { practiceFirmName } from "../lib/contracts";
import { syntheticPool } from "../lib/synthetic-server";
import { authenticateLinkedPractice, enforcePracticePair, pairingCookie } from "../lib/linked-practice-entry";
export const dynamic = "force-dynamic";
export default async function PracticeCompanyPage({ searchParams }: { searchParams: Promise<{ name?: string | string[] }> }) {
  const jar = await cookies(), token = jar.get("jg_session")?.value;
  try {
    if (jar.get("jobguard_session") || jar.get(pairingCookie)) {
      const { session } = await authenticateLinkedPractice(syntheticPool(), token);
      return <><IdentitySignIn embedded/><JobGuardApp blankPractice linkedPractice practiceFirmLabel={session.memberships[0]!.name}/></>;
    }
    if (token) await enforcePracticePair(syntheticPool(), token, await authenticatePracticeSession(syntheticPool(), token));
  } catch {
    return <><p role="alert">Your practice access could not be confirmed. Your previous jobs have not been deleted. Use Open my jobs after signing in to re-enter your current practice firm.</p><IdentitySignIn embedded/></>;
  }
  const { name } = await searchParams;
  return <JobGuardApp blankPractice practiceFirmLabel={practiceFirmName(name)} />;
}
