import { DesignedJobOverview } from "../../../designed-ui";

export const metadata = { title: "JobGuard · Job overview" };

export default async function JobOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignedJobOverview jobId={id}/>;
}
