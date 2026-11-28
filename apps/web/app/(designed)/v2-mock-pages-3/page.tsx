import { notFound } from "next/navigation";
import { PagesMock } from "./pages-mock";

export const dynamic = "force-dynamic";

export default function V2MockPages3Page() {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") notFound();
  return <PagesMock/>;
}
