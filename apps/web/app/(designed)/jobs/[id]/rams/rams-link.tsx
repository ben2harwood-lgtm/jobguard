import Link from "next/link";

export function RamsLink({ jobId }: { jobId: string }) {
  return <Link className="btn" href={`/jobs/${jobId}/rams`}>RAMS draft</Link>;
}
