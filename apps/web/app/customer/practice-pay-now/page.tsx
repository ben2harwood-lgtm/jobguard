import { notFound } from "next/navigation";
import PracticePayNow from "./screen";
export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer", robots: { index: false, follow: false } } as const;
export default function Page() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <PracticePayNow />;
}
