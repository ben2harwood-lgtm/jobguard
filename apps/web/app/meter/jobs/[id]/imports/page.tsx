import { notFound } from "next/navigation";
import { JobImport } from "../../../../ui/job-import-v3";
export default async function CompanyImportPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <JobImport sourceJobId={(await params).id} company/>;
}
