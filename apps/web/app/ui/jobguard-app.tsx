"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobSummary, SessionView } from "../lib/contracts";
import { jobsResponseV1, sessionResponseV1, UiRequestError } from "../lib/contracts";

const statusLabels: Record<JobSummary["status"], string> = { draft: "Draft", quoting: "Quoting", accepted: "Accepted", live: "Live", invoiced: "Invoiced", paid: "Paid", lost: "Lost" };

async function responseJson(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    const code = ["UNAUTHENTICATED", "TENANT_FORBIDDEN", "NOT_FOUND"].includes(body.code ?? "") ? body.code as "UNAUTHENTICATED" | "TENANT_FORBIDDEN" | "NOT_FOUND" : "UNAVAILABLE";
    throw new UiRequestError(code);
  }
  return response.json() as Promise<unknown>;
}

export function JobGuardApp() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [checking, setChecking] = useState(true);
  const [tenantId, setTenantId] = useState("");
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiRequestError | null>(null);
  const [search, setSearch] = useState("");
  const requestId = useRef(0);

  const checkSession = useCallback(async () => {
    try {
      const raw = await responseJson(await fetch("/api/session", { cache: "no-store" }));
      const parsed = sessionResponseV1.safeParse(raw);
      if (!parsed.success) throw new UiRequestError("INVALID_RESPONSE");
      setSession(parsed.data);
      setTenantId((current) => current || parsed.data.tenants[0]?.id || "");
    } catch (caught) {
      if (!(caught instanceof UiRequestError && caught.code === "UNAUTHENTICATED")) setError(caught instanceof UiRequestError ? caught : new UiRequestError("UNAVAILABLE"));
    } finally { setChecking(false); }
  }, []);

  useEffect(() => { void checkSession(); }, [checkSession]);
  const loadJobs = useCallback(async (selected: string) => {
    const ownRequest = ++requestId.current;
    setLoading(true); setError(null); setJobs([]);
    try {
      const raw = await responseJson(await fetch(`/api/jobs?tenantId=${encodeURIComponent(selected)}`, { cache: "no-store" }));
      const parsed = jobsResponseV1.safeParse(raw);
      if (!parsed.success || parsed.data.tenantId !== selected) throw new UiRequestError("INVALID_RESPONSE");
      if (ownRequest === requestId.current) setJobs(parsed.data.jobs);
    } catch (caught) {
      if (ownRequest === requestId.current) setError(caught instanceof UiRequestError ? caught : new UiRequestError("UNAVAILABLE"));
    } finally { if (ownRequest === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { if (session && tenantId) void loadJobs(tenantId); }, [session, tenantId, loadJobs]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setChecking(true); setError(null);
    try { await responseJson(await fetch("/api/session", { method: "POST" })); await checkSession(); }
    catch { setError(new UiRequestError("UNAVAILABLE")); setChecking(false); }
  }
  const visible = useMemo(() => jobs.filter((job) => `${job.title} ${job.customerLabel}`.toLowerCase().includes(search.toLowerCase())), [jobs, search]);

  if (checking) return <main className="centred" aria-live="polite"><p>Checking your session…</p></main>;
  if (!session) return <main className="signin"><div className="brand"><Logo /><span>JobGuard</span></div><section className="signin-card"><p className="eyebrow">Synthetic M1 workspace</p><h1>Keep every job on track.</h1><p className="lede">See what is live, what needs attention, and what has actually been sent or paid.</p>{error && <ErrorPanel error={error} retry={() => void checkSession()} />}<form onSubmit={signIn}><label htmlFor="email">Email address</label><input id="email" name="email" type="email" defaultValue="alex@example.test" required /><button className="primary" type="submit">Continue with demo code</button></form><p className="fineprint">Synthetic data only · No messages or payments are sent</p></section></main>;

  return <div className="app-shell">
    <aside><a className="brand" href="#main"><Logo /><span>JobGuard</span></a><nav aria-label="Primary navigation"><a className="active" href="#jobs"><Icon name="jobs" />Jobs</a><a href="#decisions"><Icon name="bell" />Decisions <span className="nav-count">0</span></a><a href="#account"><Icon name="user" />Account</a></nav><div className="pilot-note"><strong>Pilot workspace</strong><span>No JobGuard fees are charged.</span></div></aside>
    <div className="workspace"><header><button className="mobile-brand" aria-label="JobGuard home"><Logo /></button><label className="tenant-picker">Workspace<select aria-label="Select workspace" value={tenantId} onChange={(event) => { setSearch(""); setJobs([]); setTenantId(event.target.value); }}>{session.tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select></label><div className="person"><span className="avatar">AB</span><span>{session.principal.displayName}</span></div></header>
      <main id="main" tabIndex={-1}><div className="page-heading"><div><p className="eyebrow">Your work</p><h1>Jobs</h1><p>Current status, documents and customer payments — without guesswork.</p></div><button className="primary" type="button" disabled title="Job creation arrives with capture in M1-2"><span aria-hidden="true">＋</span> New job</button></div>
        <div className="toolbar"><label className="search"><span className="sr-only">Search jobs</span><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs" /></label><span className="result-count" aria-live="polite">{visible.length} {visible.length === 1 ? "job" : "jobs"}</span></div>
        {error ? <ErrorPanel error={error} retry={() => void loadJobs(tenantId)} /> : loading ? <div className="state" aria-live="polite"><span className="spinner" />Loading this workspace…</div> : visible.length === 0 ? <div className="empty"><span className="empty-icon">⌂</span><h2>{search ? "No matching jobs" : "No jobs yet"}</h2><p>{search ? "Try a different job or customer name." : "Walk through your first job when capture becomes available."}</p></div> : <section id="jobs" className="job-grid" aria-label="Jobs">{visible.map((job) => <JobCard job={job} key={job.id} />)}</section>}
      </main><nav className="bottom-nav" aria-label="Mobile navigation"><a className="active" href="#jobs"><Icon name="jobs" />Jobs</a><a href="#decisions"><Icon name="bell" />Decisions</a><a href="#account"><Icon name="user" />Account</a></nav>
    </div>
  </div>;
}

function JobCard({ job }: { job: JobSummary }) {
  const delivery = job.document.delivery === "delivered" ? "Delivered" : job.document.delivery === "queued" ? "Queued — not delivered" : job.document.delivery === "outcome_unknown" ? "Delivery unknown" : "Not sent";
  const payment = job.customerPayment === "settled" ? "Customer payment settled" : job.customerPayment === "part_paid" ? "Customer payment part-paid" : job.customerPayment === "due" ? "Customer payment due" : "Customer payment not due";
  return <article className="job-card"><div className="job-top"><span className={`status ${job.status}`}>{statusLabels[job.status]}</span><span className="updated">{job.updatedLabel}</span></div><h2>{job.title}</h2><p>{job.customerLabel}</p><dl><div><dt>Document</dt><dd>{job.document.reference ?? "No document"} · {delivery}</dd></div><div><dt>Payment</dt><dd>{payment}</dd></div></dl>{job.pilotNoCharge && <p className="pilot-badge">Pilot no-charge · no JobGuard fee paid</p>}<div className="card-action"><span>Open job</span><span aria-hidden="true">→</span></div></article>;
}

function ErrorPanel({ error, retry }: { error: UiRequestError; retry: () => void }) {
  const copy = error.code === "TENANT_FORBIDDEN" || error.code === "NOT_FOUND" ? ["Job unavailable", "You do not have access to this job or workspace."] : error.code === "INVALID_RESPONSE" ? ["We could not verify this data", "Nothing was updated. Try loading it again."] : ["Could not load jobs", "Your existing work is safe. Check your connection and retry."];
  return <section className="error" role="alert"><span aria-hidden="true">!</span><div><h2>{copy[0]}</h2><p>{copy[1]}</p><p className="error-code">Error: {error.code}</p></div><button type="button" onClick={retry}>Try again</button></section>;
}
function Logo() { return <span className="logo" aria-hidden="true">JG</span>; }
function Icon({ name }: { name: string }) { return <span className="icon" aria-hidden="true">{name === "jobs" ? "▣" : name === "bell" ? "◇" : "○"}</span>; }
