"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { captureWorkspaceResponseV1, type CaptureWorkspaceResponse } from "@jobguard/api/capture-contracts";
import { jobsResponseV1, type JobSummary } from "../lib/contracts";
import { JobParties } from "../ui/job-parties";
import { WalkIt } from "../ui/jobguard-app";
import { jobPageFetch } from "../ui/job-page-fetch";
import { ReviewProposal } from "../ui/review-proposal";
import { jobStatusLabels } from "../ui/workspace-lifecycle";
import { Card, Legacy, statusTag } from "./designed-ui";

const sessionSchema = z.object({
  environment: z.literal("pilot_no_charge"),
  csrfToken: z.string().min(1),
  memberships: z.array(z.object({ tenantId: z.guid(), name: z.string(), role: z.string() })),
});
type Session = z.infer<typeof sessionSchema>;

async function json(response: Response) {
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new Error(failure?.code ?? "UNAVAILABLE");
  }
  return response.json();
}

export function PilotJobs({ screen, jobId }: { screen: "list" | "capture" | "review"; jobId?: string }) {
  const [session, setSession] = useState<Session>();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }).then(json).then(raw => {
      if (controller.signal.aborted) return;
      const verified = sessionSchema.parse(raw);
      const preferred = new URLSearchParams(location.search).get("tenant");
      setSelected(verified.memberships.find(member => member.tenantId === preferred)?.tenantId ?? verified.memberships[0]?.tenantId ?? "");
      setSession(verified);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [retry]);
  const member = session?.memberships.find(membership => membership.tenantId === selected);
  const jobsHref = selected ? `/jobs?tenant=${encodeURIComponent(selected)}` : "/jobs";
  return <main id="main" className="rr-main">
    <header className="rr-header">
      <a href={jobsHref}>JobGuard · Jobs</a>
      <h1>{screen === "list" ? "Your jobs" : screen === "capture" ? "Start a new job" : "Review the job"}</h1>
      {session && !!session.memberships.length && <label>Business <select value={selected} onChange={event => {
        const tenant = event.target.value;
        history.replaceState(null, "", `${location.pathname}?tenant=${encodeURIComponent(tenant)}`);
        setSelected(tenant);
      }}>
        {session.memberships.map(membership => <option key={membership.tenantId} value={membership.tenantId}>{membership.name}</option>)}
      </select></label>}
    </header>
    <div className="rr-inner-content">
      {error ? <Card title={error === "UNAUTHENTICATED" ? "Sign in to see your jobs" : "Your workspace could not load"}>
        {error === "UNAUTHENTICATED" ? <a href="/sign-in">Sign in</a> : <button onClick={() => { setError(""); setRetry(value => value + 1); }}>Try again</button>}
      </Card> : !session ? <p role="status">Loading your account…</p> : !member ? <p>No businesses are available to this account.</p>
        : <PilotWorkspace key={member.tenantId} tenant={member.tenantId} canWrite={member.role === "owner"}
            csrfToken={session.csrfToken} screen={screen} jobId={jobId} jobsHref={jobsHref}/>}
    </div>
  </main>;
}

function PilotWorkspace({ tenant, canWrite, csrfToken, screen, jobId, jobsHref }: {
  tenant: string; canWrite: boolean; csrfToken: string; screen: "list" | "capture" | "review";
  jobId: string | undefined; jobsHref: string;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobSummary[]>();
  const [proposal, setProposal] = useState<CaptureWorkspaceResponse>();
  const [error, setError] = useState("");
  const pilotFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("x-csrf-token", csrfToken);
    headers.set("x-tenant-id", tenant);
    return jobPageFetch(input, { ...init, headers, cache: "no-store" });
  };
  useEffect(() => {
    if (screen === "capture") return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    async function read() {
      if (screen === "list" || !canWrite) {
        const query = new URLSearchParams({ tenantId: tenant });
        if (screen === "review" && jobId) query.set("jobId", jobId);
        const data = jobsResponseV1.parse(await json(await pilotFetch(`/api/jobs?${query}`, options)));
        if (data.tenantId !== tenant || data.jobs.some(job => job.tenantId !== tenant || (screen === "review" && job.id !== jobId))) throw new Error("WRONG_WORKSPACE_RESPONSE");
        if (!controller.signal.aborted) setJobs(data.jobs);
      } else {
        const data = captureWorkspaceResponseV1.parse(await json(await pilotFetch(`/api/jobs/${encodeURIComponent(jobId ?? "")}/proposal`, options)));
        if (data.jobId !== jobId || data.environment !== "pilot_no_charge") throw new Error("WRONG_WORKSPACE_RESPONSE");
        if (!controller.signal.aborted) setProposal(data);
      }
    }
    void read().catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [screen, jobId, canWrite, tenant, csrfToken]);
  const query = `?tenant=${encodeURIComponent(tenant)}`;
  if (error) return <p role="alert">{error === "UNAUTHENTICATED" ? "Sign in again to continue." : "This job or workspace could not be opened."} <a href={jobsHref}>Back to jobs</a></p>;
  if (screen === "capture") return canWrite ? <Legacy label="Capture job" cards>
    <WalkIt pilotFetch={pilotFetch} tenantId={tenant} mode="own" close={() => router.push(jobsHref)} reviewHref={id => `/jobs/${id}/work${query}`}/>
  </Legacy> : <p>Only the business owner can start a job.</p>;
  if (screen === "review" && canWrite) return proposal ? <Legacy label="Review and quote" cards>
    <JobParties jobId={proposal.jobId} pilotFetch={pilotFetch}/>
    <ReviewProposal result={proposal} back={() => router.push(jobsHref)} onSnapshot={setProposal}
      pilotFetch={pilotFetch} pilotProfile={<PilotFirmProfile pilotFetch={pilotFetch}/>}/>
  </Legacy> : <p role="status">Loading the job…</p>;
  return <Card title={screen === "list" ? "Jobs" : "Saved job"} action={screen === "list" && canWrite ? <a className="btn primary" href={`/jobs/new${query}`}>New job</a> : null}>
    <div data-testid="pilot-jobs-list">
      {!jobs ? <p role="status">Loading jobs…</p> : jobs.length ? jobs.map(job => <article className="job-row" key={job.id}>
        <div className="job-name"><strong>{job.title}</strong><small>{jobStatusLabels[job.status]}</small></div>
        <div className="job-side">{statusTag(job.status)}{screen === "list" && <a className="btn small" href={`/jobs/${job.id}/work${query}`}>Open job</a>}</div>
      </article>) : <p>No jobs yet.</p>}
    </div>
  </Card>;
}

const issuer = z.object({ tradingName: z.string(), addressLines: z.array(z.string()), contactEmail: z.string(), contactPhone: z.string() });
const emptyProfile: z.infer<typeof issuer> = { tradingName: "", addressLines: [], contactEmail: "", contactPhone: "" };

function PilotFirmProfile({ pilotFetch }: { pilotFetch: typeof fetch }) {
  const [profile, setProfile] = useState(emptyProfile);
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void pilotFetch("/api/firm-profile", { signal: controller.signal }).then(json)
      .then(raw => {
        if (controller.signal.aborted) return;
        setProfile(issuer.nullable().parse(raw.profile) ?? emptyProfile);
        setAvailable(raw.canSave === true);
      })
      .catch(() => { if (!controller.signal.aborted) setMessage("Business details could not be loaded."); });
    return () => controller.abort();
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await json(await pilotFetch("/api/firm-profile", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "firm-profile.v1", tradingName: form.get("name"),
          addressLines: String(form.get("address")).split("\n").map(line => line.trim()).filter(Boolean),
          contactEmail: form.get("email"), contactPhone: form.get("phone"),
        }),
      }));
      setMessage("Business details saved. Preview again to use any changed details.");
    } catch { setMessage("Business details could not be saved. Check the fields and try again."); }
    finally { setBusy(false); }
  }
  return <details>
    <summary>Business details for the quote</summary>
    {available && <form onSubmit={save}>
      <label>Trading name<input name="name" defaultValue={profile.tradingName} required/></label>
      <label>Business address (up to three lines)<textarea name="address" defaultValue={profile.addressLines.join("\n")} required/></label>
      <label>Business email<input type="email" name="email" defaultValue={profile.contactEmail} required/></label>
      <label>Business phone<input name="phone" defaultValue={profile.contactPhone}/></label>
      <button type="submit" disabled={busy}>Save business details</button>
    </form>}
    <p role="status">{message}</p>
  </details>;
}
