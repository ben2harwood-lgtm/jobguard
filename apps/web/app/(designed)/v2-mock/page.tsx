import { notFound } from "next/navigation";
import { WorkMock } from "./work-mock";

export const dynamic = "force-dynamic";

export default function V2MockPage() {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") notFound();
  return <WorkMock/>;
}
