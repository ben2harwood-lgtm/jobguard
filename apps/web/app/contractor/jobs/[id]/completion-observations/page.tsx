import { CompletionObservations } from "./completion-observations";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 return <CompletionObservations key={id} jobId={id}/>;
}
