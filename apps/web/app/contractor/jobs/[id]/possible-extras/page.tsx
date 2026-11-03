import { PossibleExtras } from "../../../../ui/possible-extras";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PossibleExtras key={id} jobId={id}/>;
}
