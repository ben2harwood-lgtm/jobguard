import { notFound } from "next/navigation";
import MandateScreen from "./mandate-screen";
export const dynamic = "force-dynamic";
export default function MandatePage() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <MandateScreen />;
}
