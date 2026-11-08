import { DesignedJob } from "../../../jobs-screens";

export const metadata = { title: "JobGuard · Job overview" };
export default async function JobOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignedJob jobId={id} tab="overview"/>;
}
