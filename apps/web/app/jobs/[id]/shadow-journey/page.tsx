import { ShadowJourney } from "../../../ui/shadow-journey";
export default async function ShadowJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  return <ShadowJourney jobId={(await params).id}/>;
}
