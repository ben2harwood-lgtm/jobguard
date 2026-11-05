import { notFound } from "next/navigation";
import { PracticeBankScreen } from "./screen";
export default function PracticeBankPage() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <PracticeBankScreen />;
}
