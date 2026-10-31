import { JobImport } from "../../../ui/job-import-v3";
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobImport key={id} sourceJobId={id}/>;
}
