import { notFound } from "next/navigation";
import { CrewScreen } from "./crew-screen";

export const metadata = { title: "JobGuard · Your crew" };
// V2-C3C-UI, V2 only.
export default function CrewPage() {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <CrewScreen/>;
}
