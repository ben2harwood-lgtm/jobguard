import { JobGuardApp } from "../ui/jobguard-app";
import { cookies } from "next/headers";

export default async function Home() {
  const hasCompanySession = Boolean((await cookies()).get("jobguard_session")?.value);
  return <JobGuardApp hasCompanySession={hasCompanySession} />;
}
