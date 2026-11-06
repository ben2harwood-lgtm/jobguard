import { JobGuardApp } from "../ui/jobguard-app";
import { practiceFirmName } from "../lib/contracts";
export const dynamic = "force-dynamic";
export default async function PracticeCompanyPage({ searchParams }: { searchParams: Promise<{ name?: string | string[] }> }) {
  const { name } = await searchParams;
  return <JobGuardApp blankPractice practiceFirmLabel={practiceFirmName(name)} />;
}
