import { Recovery18800Launch } from "./launch";

export default async function Page({ searchParams }: { searchParams: Promise<{ jobId?: string | string[] }> }) {
  return <Recovery18800Launch requestedJobId={(await searchParams).jobId} />;
}
