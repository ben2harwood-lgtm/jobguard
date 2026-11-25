export function FridayUpdateLink({ jobId }: { jobId: string }) {
  return <a className="btn" href={`/jobs/${jobId}/friday-update`}>Friday update</a>;
}
