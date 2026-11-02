import { z } from "zod";
import { demoLink } from "../chooser-state";
import { Core1000Journey } from "./journey";

const selection = z.object({ runId: z.string().uuid(), tenantId: z.string().uuid() });
type Query = { jobId?: string | string[]; runId?: string | string[]; tenantId?: string | string[] };
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams, saved = selection.safeParse(query);
  return <Core1000Journey requestedJobId={query.jobId} {...(saved.success ? { chooserHref: demoLink(saved.data.tenantId, saved.data.runId) } : {})} />;
}
