import { MaterialsIssues } from "./materials-issues";
export default async function MaterialsIssuesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><h1>Materials movements</h1><p>Practice sandbox — synthetic data; nothing is sent or charged</p><MaterialsIssues jobId={id} /></main>;
}
