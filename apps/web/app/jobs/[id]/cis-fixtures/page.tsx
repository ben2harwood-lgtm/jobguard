import { notFound } from "next/navigation";
import { CisFixtureScreen } from "./screen";
export default async function CisFixturePage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <CisFixtureScreen key={id} jobId={id} />;
}
