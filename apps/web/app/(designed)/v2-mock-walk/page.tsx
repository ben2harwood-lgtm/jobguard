import { notFound } from "next/navigation";
import { WalkMock } from "./walk-mock";

export const dynamic = "force-dynamic";

export default function V2MockWalkPage() {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") notFound();
  return <WalkMock/>;
}
