import Link from "next/link";
export function BriefProgressLink({ jobId }: { jobId: string }) {
  return <p><Link href={`/jobs/${encodeURIComponent(jobId)}/brief-progress`}>Brief progress</Link></p>;
}
