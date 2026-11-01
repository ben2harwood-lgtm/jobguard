import { Core1000Journey } from "./journey";

export default async function Page({ searchParams }: { searchParams: Promise<{ jobId?: string | string[] }> }) {
  return <Core1000Journey requestedJobId={(await searchParams).jobId} />;
}
