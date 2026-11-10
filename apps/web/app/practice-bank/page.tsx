import { notFound } from "next/navigation";
import { PracticeBankScreen } from "./screen";
// Check the deployment mode at request time, never cache a build-time 404.
export const dynamic = "force-dynamic";
export default function PracticeBankPage() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <PracticeBankScreen />;
}
