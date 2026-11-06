import { DirectDebitPracticeScreen } from "./screen";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DirectDebitPracticeScreen key={(await params).id} jobId={(await params).id} />;
}
