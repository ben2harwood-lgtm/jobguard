import { JobImport } from "../../../../ui/job-import-v3";
export default async function CompanyImportPage({ params }: { params: Promise<{ id: string }> }) {
  return <JobImport sourceJobId={(await params).id} company/>;
}
