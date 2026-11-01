import { cookies } from "next/headers";
import { jobRecordProposalV1 } from "@jobguard/core";
import { CaptureRepository } from "@jobguard/db";
import { WorkspaceShell } from "../../ui/workspace-shell";
import { JobWorkState } from "../../ui/job-work-state";
import { identityApplication } from "../../lib/identity-server";
import { meterWorkApplication } from "../../lib/meter-server";
import { syntheticPool } from "../../lib/synthetic-server";

export default async function JobPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const { id } = await params, { company } = await searchParams;
  if (!company) return <WorkspaceShell jobId={id}/>;
  // A tenant selection is never authority. Reauthenticate the company session,
  // then let the same CH-4 owner/job/track boundary authorize this saved job.
  try {
    const identity = identityApplication(), sessionToken = (await cookies()).get("jobguard_session")?.value;
    const session = await identity.session(sessionToken);
    const credentials = { sessionToken, csrfToken: session.csrfToken, tenantHeader: company, origin: identity.allowedOrigin };
    await meterWorkApplication().read(credentials, id);
    const context = await identity.context(credentials);
    const capture = await new CaptureRepository(syntheticPool()).readByJob(context, id);
    if (!capture) throw new Error("NOT_FOUND");
    const proposal = jobRecordProposalV1.parse(capture.proposal);
    return <main className="workspace-page" id="captured-job-workspace" data-testid="workspace-job-id" data-job-id={id}>
      <h1>{proposal.title.value}</h1>
      <p role="note">Practice sandbox — synthetic data; nothing is sent or charged</p>
      <section aria-label="Captured scope"><h2>Captured scope</h2><ul>{proposal.lines.map((line, index) => <li key={index}>{line.description.value}</li>)}</ul></section>
      <JobWorkState jobId={id} company={{ tenantId: company, csrfToken: session.csrfToken }}/>
    </main>;
  } catch {
    return <main className="workspace-page"><h1>You cannot open this job</h1><p>Use a saved job available to your company session.</p></main>;
  }
}
