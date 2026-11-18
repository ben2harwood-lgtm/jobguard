import { MeterScreen } from "./meter-screen";
export default async function MeterPage({ searchParams }: { searchParams?: Promise<{ tenant?: string | string[] }> }) {
  return <MeterScreen tenant={(await searchParams)?.tenant} />;
}
