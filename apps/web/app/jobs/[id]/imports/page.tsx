import { notFound } from "next/navigation";
import { JobImport } from "../../../ui/job-import-v3";
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <JobImport key={id} sourceJobId={id}/>;
}
