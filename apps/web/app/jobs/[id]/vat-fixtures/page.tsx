import { vatFixtureIssueRefusal } from "@jobguard/api/workspace";
import { notFound } from "next/navigation";
import { VatFixtureScreen } from "./screen";
export const dynamic = "force-dynamic";
export default async function VatFixturePage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <VatFixtureScreen key={id} jobId={id} issueRefusal={vatFixtureIssueRefusal()} />;
}
