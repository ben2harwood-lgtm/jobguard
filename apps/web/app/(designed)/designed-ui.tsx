"use client";

// The approved clickable design (JobGuard reference implementation, 19 Oct 2026), rebuilt
// against the app's existing routes: /api/session, /api/decisions, /api/jobs,
// /api/jobs/[id], /api/jobs/[id]/value and /api/jobs/[id]/things-to-check.
// Only facts those routes return are shown; anything else says it is not recorded yet.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { jobsResponseV1, sessionResponseV1, type JobSummary, type SessionView } from "../lib/contracts";
import { jobWorkspaceResponseV1, type JobWorkspaceResponse } from "@jobguard/api/workspace-contracts";
import { jobStatusLabels } from "../ui/workspace-lifecycle";

const RAIL_ICONS: Record<string, string> = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z", jobs: "M4 6h16v15H4ZM8 6V3h8v3M4 11h16", bell: "M5 17h14l-2-3V9c0-7-10-7-10 0v5ZM10 21h4",
  money: "M3 21V12h4v9m3 0V7h4v14m3 0V2h4v19M2 21h21", more: "M5 12h.01M12 12h.01M19 12h.01", search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  message: "M21 3H3v14h5v5l5-5h8ZM7 10h.01M12 10h.01M17 10h.01", settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  chevron: "m9 5 7 7-7 7", close: "m5 5 14 14M19 5 5 19",
};
const ICONS: Record<string, string> = {
  search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0", layers: "m12 2 10 6-10 6L2 8ZM2 13l10 6 10-6M2 18l10 6 10-6",
  shield: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM8 12l3 3 5-6", alert: "M12 3 2 21h20ZM12 9v5M12 17v1", file: "M5 2h9l5 5v15H5ZM14 2v6h5M8 12h8M8 16h8",
};
const PHOTOS = ["/design/assets/reference-job-martin.jpg", "/design/assets/reference-job-harper.jpg", "/design/assets/reference-job-ocean.jpg"];
const TABS = [["today", "Today", "home"], ["jobs", "Jobs", "jobs"], ["check", "To check", "bell"], ["money", "Money", "money"], ["more", "More", "more"]] as const;
const UNKNOWN = "Details needed";

function RailIcon({ name }: { name: string }) {
  return <svg className="rr-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={RAIL_ICONS[name]}/></svg>;
}
function Icon({ name }: { name: string }) {
  return <svg className="icon" aria-hidden="true" viewBox="0 0 24 24"><path d={ICONS[name] ?? ICONS.file}/></svg>;
}
function Logo() {
  return <svg className="rr-logo-mark" viewBox="0 0 48 54" role="img" aria-label="JobGuard shield"><defs><linearGradient id="shield-gradient" x2="1" y2="1"><stop stopColor="#54e0dc"/><stop offset="1" stopColor="#06758e"/></linearGradient></defs><path d="M24 1 45 8v19c0 12-12 21-21 26C15 48 3 39 3 27V8Z" fill="url(#shield-gradient)"/><path d="M24 1v52c9-5 21-14 21-26V8Z" fill="#103643"/><path d="m24 10 12 4v12c0 7-6 13-12 17V30h-7v-9h13v-4l-6-2-7 3v8l-6 3V14Z" fill="#f6ffff"/><path d="M24 21h6v9h-6" fill="#64e5e4"/></svg>;
}
function Tag({ tone = "", children }: { tone?: string; children: ReactNode }) { return <span className={`tag ${tone}`}>{children}</span>; }
function Card({ title, sub, action, children, className = "" }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}><div className="card-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><div className="empty-icon"><Icon name="layers"/></div><h3>{title}</h3><p>{text}</p></div>;
}
function Note({ children }: { children: ReactNode }) { return <div className="note"><Icon name="shield"/><div>{children}</div></div>; }

const known = (value: string) => value && value !== UNKNOWN ? value : "";
const initials = (name: string) => name.split(/\s+/u).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "JG";
function money(pence: number | null) { return pence === null ? "Not recorded yet" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function shortDate(iso: string) { const date = new Date(iso); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
function documentLine(job: JobSummary) {
  const { kind, reference, delivery } = job.document;
  if (kind === "none") return "No quote sent yet";
  if (kind === "unknown") return "Open this job to check its documents";
  const name = `${kind === "quote" ? "Quote" : "Invoice"}${reference ? ` ${reference}` : ""}`;
  return delivery === "delivered" ? `${name} sent` : delivery === "queued" ? `${name} waiting to send — not sent yet` : delivery === "outcome_unknown" ? `${name} — we need to check whether it sent` : `${name} not sent`;
}
const paymentLabels: Record<JobSummary["customerPayment"], string> = { not_due: "Customer payment not due yet", due: "Customer payment due", part_paid: "Customer has paid part", settled: "Customer has paid", unknown: "Payment not checked yet" };
function statusTag(status: JobSummary["status"]) {
  const tone = status === "live" ? "blue" : status === "paid" || status === "accepted" ? "green" : status === "lost" ? "" : status === "invoiced" ? "amber" : "";
  return <Tag tone={tone}>{jobStatusLabels[status]}</Tag>;
}
function needsChecking(job: JobSummary) { return job.document.delivery === "queued" || job.document.delivery === "outcome_unknown" || job.customerPayment === "due"; }

type Workspace = { session: SessionView; tenantId: string; pending: number };
type Load = { state: "loading" } | { state: "signed-out" } | { state: "error" } | { state: "ready"; workspace: Workspace };

async function readJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 401) throw new Error("UNAUTHENTICATED");
  if (!response.ok) throw new Error("UNAVAILABLE");
  return response.json() as Promise<unknown>;
}

function useWorkspace(): [Load, () => void] {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const session = sessionResponseV1.parse(await readJson("/api/session"));
        const tenantId = session.tenants[0]?.id;
        if (!tenantId) throw new Error("UNAVAILABLE");
        const counts = await readJson(`/api/decisions?tenantId=${encodeURIComponent(tenantId)}`).catch(() => null) as { counts?: { pending?: number } } | null;
        if (current) setLoad({ state: "ready", workspace: { session, tenantId, pending: counts?.counts?.pending ?? 0 } });
      } catch (error) {
        if (current) setLoad({ state: error instanceof Error && error.message === "UNAUTHENTICATED" ? "signed-out" : "error" });
      }
    })();
    return () => { current = false; };
  }, [attempt]);
  return [load, () => { setLoad({ state: "loading" }); setAttempt(n => n + 1); }];
}

function Shell({ workspace, title, subtitle, active, onSearch, children }: { workspace: Workspace | null; title: string; subtitle: string; active: string; onSearch?: () => void; children: ReactNode }) {
  const router = useRouter();
  const [panel, setPanel] = useState<"messages" | "settings" | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const name = workspace?.session.principal.displayName ?? "";
  const firstName = name.split(/\s+/u)[0] ?? "";
  const company = workspace?.session.tenants.find(tenant => tenant.id === workspace.tenantId)?.name ?? "Your practice workspace";
  const go = (tab: string) => {
    if (tab === "jobs") router.push("/jobs");
    else window.location.assign("/"); // Not rebuilt yet: the existing home screen holds these.
  };
  const greeting = now ? `Good ${now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"}${firstName ? `, ${firstName}` : ""}.` : "";
  const today = now ? now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "") : "";
  const search = onSearch ?? (() => router.push("/jobs"));
  return <div className="rr-app rr-is-inner" data-persona="owner">
    <a className="skip" href="#main">Skip to content</a>
    <aside id="sidebar" className="rr-rail">
      <a className="rr-brand" href="/"><Logo/><div><strong>JobGuard</strong><p>Run the job.<br/>Protect the profit.<br/>Get paid.</p></div><span className="rr-beta">BETA</span></a>
      <nav className="rr-navigation" aria-label="Main navigation">{TABS.map(([id, label, icon]) => <button key={id} type="button" className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} onClick={() => go(id)}><RailIcon name={icon}/><span>{label}</span>{id === "check" && <b>{workspace?.pending ?? 0}</b>}</button>)}</nav>
      <div className="rr-secondary-navigation"><button type="button" onClick={search}><RailIcon name="search"/><span>Search</span></button><button type="button" onClick={() => setPanel("messages")}><RailIcon name="message"/><span>Messages</span></button><button type="button" onClick={() => setPanel("settings")}><RailIcon name="settings"/><span>Settings</span></button></div>
      <button type="button" className="rr-account" onClick={() => setPanel("settings")}><span>{initials(name)}</span><div>{firstName || "Practice"}<small>Builder</small></div><RailIcon name="chevron"/></button>
      <div className="rr-rail-foot"><div className="rr-rail-photo"></div><p>BUILT<br/>FOR BUILDERS.<br/>BACKED BY<br/>EVIDENCE.</p></div>
    </aside>
    <main className="rr-main" id="main">
      <header className="rr-header"><div className="rr-company">{company.toUpperCase()}</div><h1>{title}</h1><p className="rr-subtitle">{subtitle}</p>
        <div className="rr-header-tools"><button type="button" className="rr-search" onClick={search}><RailIcon name="search"/><span>Search jobs, suppliers, invoices...</span></button><button className="rr-round rr-notify" type="button" aria-label="Things needing attention" onClick={() => go("check")}><RailIcon name="bell"/>{(workspace?.pending ?? 0) > 0 && <i></i>}</button><button className="rr-round" type="button" aria-label={`${firstName || "Your"} profile`} onClick={() => setPanel("settings")}>{initials(name)}</button></div>
        <div className="rr-date"><span>{today}</span><span>{greeting}</span></div>
      </header>
      <div id="reference-content" className="rr-inner-content">{children}</div>
      <footer className="rr-footer"><span>Practice workspace · fictional records · no real messages, invoices or payments sent</span></footer>
    </main>
    <nav className="rr-mobile-nav" aria-label="Mobile navigation">{TABS.map(([id, label, icon]) => <button key={id} type="button" className={active === id ? "active" : ""} onClick={() => go(id)}><RailIcon name={icon}/><span>{label}</span></button>)}</nav>
    {panel && <Panel title={panel === "messages" ? "Your messages" : "Workspace settings"} text={panel === "messages" ? "No real customer or supplier messages are connected to this practice workspace." : "Account and practice settings are on the existing home screen while these screens are rebuilt."} close={() => setPanel(null)}>
      {panel === "settings" && <a className="btn" href="/">Open the home screen →</a>}
    </Panel>}
  </div>;
}

function Panel({ title, text, close, children }: { title: string; text: string; close: () => void; children?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); }, []);
  return <dialog ref={ref} className="rr-assist" onClose={close}><div className="rr-assist-head"><h2>{title}</h2><button type="button" aria-label="Close" onClick={() => ref.current?.close()}><RailIcon name="close"/></button></div><p>{text}</p>{children}</dialog>;
}

function StateScreen({ load, retry, title }: { load: Load; retry: () => void; title: string }) {
  const [busy, setBusy] = useState(false);
  async function signIn() { setBusy(true); try { await fetch("/api/session", { method: "POST" }); } finally { setBusy(false); retry(); } }
  const body = load.state === "loading" ? <Card title="Getting your jobs ready"><div className="card-body"><p aria-live="polite">Loading…</p></div></Card>
    : load.state === "signed-out" ? <Card title="Open the practice workspace"><div className="card-body"><p>This uses made-up jobs only. Nothing is sent or charged.</p><div style={{ marginTop: 18 }}><button type="button" className="btn primary" disabled={busy} onClick={() => void signIn()}>Open the practice workspace →</button></div></div></Card>
    : <Card title="Your jobs did not load"><div className="card-body"><p role="alert">Nothing changed. Please try again.</p><div style={{ marginTop: 18 }}><button type="button" className="btn primary" onClick={retry}>Try again</button></div></div></Card>;
  return <Shell workspace={null} title={title} subtitle="One place to manage the job, spot problems early and know what comes next." active="jobs">{body}</Shell>;
}

export function DesignedJobs() {
  const router = useRouter();
  const [load, retry] = useWorkspace();
  const [jobs, setJobs] = useState<JobSummary[] | null>(null), [failed, setFailed] = useState(false), [filter, setFilter] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const tenantId = load.state === "ready" ? load.workspace.tenantId : "";
  useEffect(() => {
    if (!tenantId) return;
    let current = true;
    readJson(`/api/jobs?tenantId=${encodeURIComponent(tenantId)}`).then(raw => {
      const parsed = jobsResponseV1.parse(raw);
      if (parsed.tenantId !== tenantId) throw new Error("INVALID_RESPONSE");
      if (current) setJobs(parsed.jobs);
    }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [tenantId]);
  const visible = useMemo(() => (jobs ?? []).filter(job => `${job.title} ${job.siteLabel} ${job.customerLabel}`.toLowerCase().includes(filter.toLowerCase())), [jobs, filter]);
  if (load.state !== "ready") return <StateScreen load={load} retry={retry} title="Your jobs."/>;
  const open = (job: JobSummary) => router.push(`/jobs/${job.id}/overview`);
  return <Shell workspace={load.workspace} title="Your jobs." subtitle="One place to manage the job, spot problems early and know what comes next." active="jobs" onSearch={() => searchRef.current?.focus()}>
    <div className="page-head"><div><div className="kicker">MY WORK</div><h2 tabIndex={-1}>All your jobs</h2><p>One place for what was agreed, who is working, what arrived and what the job is worth.</p></div><div className="head-buttons"><a className="btn primary" href="/">New job +</a></div></div>
    <Card title="Jobs">
      <div className="toolbar"><label className="search"><Icon name="search"/><input ref={searchRef} type="search" aria-label="Search jobs" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search jobs, sites or customers…"/></label><Tag>{visible.length} {visible.length === 1 ? "job" : "jobs"}</Tag></div>
      <div data-testid="designed-jobs-list">
        {failed ? <Empty title="Your jobs did not load" text="Nothing changed. Refresh the page to try again."/>
          : jobs === null ? <Empty title="Loading your jobs…" text="This takes a moment."/>
          : visible.length === 0 ? <Empty title={jobs.length ? "No matching jobs" : "No jobs yet"} text={jobs.length ? "Try a shorter search or clear the search box." : "Start a new job to see it here."}/>
          : visible.map((job, index) => <article className="job-row" key={job.id}>
            <img className="job-photo" src={PHOTOS[index % PHOTOS.length]} alt="Illustrative building"/>
            <div className="job-name"><strong>{job.title}</strong><small>{[known(job.siteLabel) || "Site details needed", known(job.customerLabel) || "Customer details needed", job.updatedLabel].join(" · ")}</small><p>{documentLine(job)} · {paymentLabels[job.customerPayment]}</p></div>
            <div className="job-side"><strong>{jobStatusLabels[job.status]}</strong>{needsChecking(job) ? <Tag tone="amber">1 to check</Tag> : statusTag(job.status)}<button type="button" className="btn small" onClick={() => open(job)}>Open job →</button></div>
          </article>)}
      </div>
    </Card>
  </Shell>;
}

const jobValueV1 = z.object({
  approvedExtras: z.object({ pence: z.number().int().nullable() }), invoicedGross: z.object({ pence: z.number().int().nullable() }),
  recordedGross: z.object({ pence: z.number().int().nullable() }), outstandingGross: z.object({ pence: z.number().int().nullable() }),
  pendingExtras: z.array(z.unknown()),
});
const thingsToCheckV1 = z.object({ state: z.object({ factCandidates: z.array(z.unknown()), finding: z.unknown().nullable() }) });
type Detail = { job: JobWorkspaceResponse["job"]; summary: JobSummary | null; value: z.infer<typeof jobValueV1> | null; checks: number | null; photo: string };

function nextAction(job: Detail["job"], summary: JobSummary | null) {
  if (summary && (summary.document.delivery === "queued" || summary.document.delivery === "outcome_unknown")) return { title: "Check whether the quote was sent", body: documentLine(summary) + ".", label: "Check the quote" };
  switch (job.status) {
    case "draft": return { title: "Finish describing the work", body: "Check the draft before a quote is prepared. Nothing is sent yet.", label: "Open the draft" };
    case "quoting": return { title: "Price and send the quote", body: "Price the checked work, preview the quote, then choose to send it.", label: "Price the work" };
    case "accepted": return { title: "Start the work", body: "The customer said yes. Switch the job on when the work begins.", label: "Start the job" };
    case "live": return { title: "Keep the job record up to date", body: "Add proof photos and log any extra work as it happens, so nothing is forgotten.", label: "Record the work" };
    case "invoiced": return { title: "Watch for the customer’s payment", body: "The invoice is recorded. A payment you enter by hand is not a bank-confirmed receipt.", label: "Check the money" };
    case "paid": return { title: "This job is paid", body: "Nothing urgent on this job.", label: "Open the job" };
    case "lost": return { title: "This job did not go ahead", body: "The record is kept for reference.", label: "Open the job" };
  }
}

export function DesignedJobOverview({ jobId }: { jobId: string }) {
  const [load, retry] = useWorkspace();
  const [detail, setDetail] = useState<Detail | null>(null), [failed, setFailed] = useState<"forbidden" | "unavailable" | null>(null);
  const tenantId = load.state === "ready" ? load.workspace.tenantId : "";
  useEffect(() => {
    if (!tenantId) return;
    let current = true;
    const id = encodeURIComponent(jobId);
    (async () => {
      const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (!response.ok) { if (current) setFailed([401, 403, 404].includes(response.status) ? "forbidden" : "unavailable"); return; }
      const { job } = jobWorkspaceResponseV1.parse(await response.json());
      const [list, value, checks] = await Promise.all([
        readJson(`/api/jobs?tenantId=${encodeURIComponent(tenantId)}`).then(raw => jobsResponseV1.parse(raw).jobs).catch(() => [] as JobSummary[]),
        readJson(`/api/jobs/${id}/value`).then(raw => jobValueV1.parse(raw)).catch(() => null),
        readJson(`/api/jobs/${id}/things-to-check`).then(raw => { const { state } = thingsToCheckV1.parse(raw); return state.factCandidates.length + (state.finding ? 1 : 0); }).catch(() => null),
      ]);
      const index = Math.max(0, list.findIndex(item => item.id === job.id));
      if (current) setDetail({ job, summary: list.find(item => item.id === job.id) ?? null, value, checks, photo: PHOTOS[index % PHOTOS.length]! });
    })().catch(() => { if (current) setFailed("unavailable"); });
    return () => { current = false; };
  }, [tenantId, jobId]);
  if (load.state !== "ready") return <StateScreen load={load} retry={retry} title="Your job"/>;
  if (failed || !detail) return <Shell workspace={load.workspace} title="Your job" subtitle="Overview, work, money and records — together." active="jobs">
    {failed ? <Card title={failed === "forbidden" ? "You cannot open this job" : "Your job could not load"}><div className="card-body"><p role="alert">{failed === "forbidden" ? "Use a job available to this practice session." : "Nothing changed. Refresh the page to try again."}</p><div style={{ marginTop: 18 }}><a className="btn primary" href="/jobs">Back to jobs</a></div></div></Card>
      : <Card title="Loading your job…"><div className="card-body"><p aria-live="polite">This takes a moment.</p></div></Card>}
  </Shell>;
  const { job, summary, value, checks, photo } = detail;
  const workspaceHref = `/jobs/${job.id}`;
  const site = summary ? known(summary.siteLabel) : "", customer = summary ? known(summary.customerLabel) : "";
  const action = nextAction(job, summary);
  const tabs = [["overview", "Overview", ""], ["work", "Work", workspaceHref], ["money", "Money", `${workspaceHref}/value`], ["records", "Records", workspaceHref]] as const;
  return <Shell workspace={load.workspace} title={job.title} subtitle={[site, customer].filter(Boolean).join(" · ") || "Site and customer details still needed"} active="jobs">
    <>
      <div className="job-header"><div className="page-head"><div><div className="kicker">JOB {job.id.slice(0, 8).toUpperCase()}</div><h2 tabIndex={-1}>{job.title}</h2><p>{[site || "Site details needed", customer || "Customer details needed"].join(" · ")}</p></div><div className="head-buttons"><a className="btn primary" href={workspaceHref}>Record an extra +</a></div></div></div>
      <div className="job-caption" style={{ margin: "-12px 0 19px" }} data-testid="designed-job-overview" data-job-id={job.id}>{statusTag(job.status)} {summary && needsChecking(summary) ? <Tag tone="amber">1 to check</Tag> : <Tag tone="green">No current alerts</Tag>} <span>Updated {shortDate(job.updatedAt)}</span></div>
      <nav className="job-tabs" aria-label="Job sections">{tabs.map(([id, label, href]) => id === "overview" ? <button key={id} type="button" className="active" aria-current="page">{label}</button> : <button key={id} type="button" onClick={() => window.location.assign(href)}>{label}</button>)}</nav>
      <div className="job-spot">
        <Card title="The job at a glance"><div className="photo-card"><img src={photo} alt="Illustrative photograph of a property"/><div className="photo-copy"><div className="kicker">AGREED WORK</div><h3>{job.title}</h3><p style={{ fontSize: 12, lineHeight: 1.8 }}>{job.scopeIdentityIds.length ? `${job.scopeIdentityIds.length} confirmed ${job.scopeIdentityIds.length === 1 ? "item" : "items"} of work.` : "The agreed work has not been confirmed yet."}</p><div className="job-caption"><Tag tone="blue">{summary ? documentLine(summary) : "Documents not checked"}</Tag></div><button type="button" className="btn small" onClick={() => window.location.assign(workspaceHref)}>Open the work plan →</button></div></div></Card>
        <Card title="Next action"><div className="card-body"><div className="kicker">JOBGUARD SUGGESTS</div><h3 style={{ fontSize: 17, margin: "8px 0" }}>{action.title}</h3><p>{action.body}</p><div style={{ marginTop: 20 }}><button type="button" className="btn primary wide" onClick={() => window.location.assign(workspaceHref)}>{action.label} →</button></div></div></Card>
      </div>
      <div className="two-col">
        <div><Card title="What JobGuard is watching" sub="The checks come from this job’s practice records." action={<button type="button" className="btn ghost small" onClick={() => window.location.assign(workspaceHref)}>See all →</button>}>
          {checks ? <article className="risk-row compact"><div className="risk-icon"><Icon name="alert"/></div><div className="risk-copy"><div className="risk-kicker"><span>{site || job.title}</span><Tag tone="amber">Needs attention</Tag></div><h3>{checks} {checks === 1 ? "thing" : "things"} to check on this job</h3><p>Review them before they cost you time or money.</p><div className="risk-source">Why we flagged it: Things to check on this job</div></div><div className="risk-action"><button type="button" className="btn small primary" onClick={() => window.location.assign(workspaceHref)}>Review →</button></div></article>
            : <Empty title="No urgent checks" text={checks === null ? "We could not load the checks for this job. Open the job to see them." : "Nothing in this job currently needs an owner decision."}/>}
        </Card></div>
        <div><Card title="Money on this job"><div className="card-body">
          <div className="detail-grid">
            <div className="detail-block"><small>Approved extras</small><strong>{money(value?.approvedExtras.pence ?? null)}</strong><p>Not automatically invoiced.</p></div>
            <div className="detail-block"><small>Invoiced</small><strong>{money(value?.invoicedGross.pence ?? null)}</strong><p>Including VAT.</p></div>
            <div className="detail-block"><small>Recorded as paid</small><strong>{money(value?.recordedGross.pence ?? null)}</strong><p>Entered by hand, not bank-confirmed.</p></div>
            <div className="detail-block"><small>Still owed</small><strong>{money(value?.outstandingGross.pence ?? null)}</strong><p>Invoiced but not yet recorded as paid.</p></div>
            <div className="detail-block wide"><small>Priced extras waiting for a customer decision</small><strong>{value ? value.pendingExtras.length : "Not recorded yet"}</strong><p>Not included in the approved amounts above.</p></div>
          </div>
          <div className="divider"></div>
          <Note>These figures come from this job’s practice records. A manually entered payment is not a bank-confirmed receipt.</Note>
          <div style={{ marginTop: 14 }}><button type="button" className="btn small primary" onClick={() => window.location.assign(`${workspaceHref}/value`)}>See the money trail →</button></div>
        </div></Card></div>
      </div>
      <div style={{ marginTop: 18 }}><Card title="Coming up"><div className="mini-calendar">
        <div className="date-row"><strong>Status</strong><span>{jobStatusLabels[job.status]}</span></div>
        <div className="date-row"><strong>Quote or invoice</strong><span>{summary ? documentLine(summary) : "Not checked yet"}</span></div>
        <div className="date-row"><strong>Customer payment</strong><span>{summary ? paymentLabels[summary.customerPayment] : "Not checked yet"}</span></div>
        <div className="date-row"><strong>Last updated</strong><span>{shortDate(job.updatedAt)}</span></div>
        <button type="button" className="btn primary small" onClick={() => window.location.assign(workspaceHref)}>Review the work →</button>
      </div></Card></div>
    </>
  </Shell>;
}
