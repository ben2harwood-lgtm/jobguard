import { RecoveryJourney } from "../../../ui/recovery-journey";
export default async function RecoveryJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  return <RecoveryJourney jobId={(await params).id}/>;
}
