import { cookies } from "next/headers";
import { EnterpriseLivePromptRepository } from "@jobguard/db";
import { syntheticPool } from "../../../../lib/synthetic-server";
import { JobFinish } from "./job-finish";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 let canFinish = false, finish: unknown = null;
 if (process.env.JOBGUARD_ENV === "synthetic_demo") {
  const session = (await cookies()).get("jg_session")?.value;
  if (session) {
   try {
    const status = await new EnterpriseLivePromptRepository(syntheticPool()).finishStatus(session, id);
    canFinish = status.canFinish === true; finish = status.finish;
   } catch { /* Missing or refused owner authority exposes no completion controls or state. */ }
  }
 }
 return <JobFinish key={id} jobId={id} canFinish={canFinish} initialFinish={finish}/>;
}
