"use client";

// Shared frame for the screens rebuilt from the approved clickable design (JobGuard reference
// implementation, 19 Oct 2026). Screens read only the app's existing routes and show only facts
// those routes return; anything else says it is not recorded yet. Existing working tools are
// hosted inside <Legacy>, which keeps the app's own styles (see scope-reference-css.mjs).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { jobsResponseV1, sessionResponseV1, type JobSummary, type SessionView } from "../lib/contracts";
import { jobStatusLabels } from "../ui/workspace-lifecycle";

const RAIL_ICONS: Record<string, string> = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z", jobs: "M4 6h16v15H4ZM8 6V3h8v3M4 11h16", bell: "M5 17h14l-2-3V9c0-7-10-7-10 0v5ZM10 21h4",
  money: "M3 21V12h4v9m3 0V7h4v14m3 0V2h4v19M2 21h21", more: "M5 12h.01M12 12h.01M19 12h.01", search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  message: "M21 3H3v14h5v5l5-5h8ZM7 10h.01M12 10h.01M17 10h.01", settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  chevron: "m9 5 7 7-7 7", close: "m5 5 14 14M19 5 5 19", arrow: "M4 12h16m-6-6 6 6-6 6", plus: "M12 4v16M4 12h16",
  people: "M3 21v-4c0-5 10-5 10 0v4M12 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0M16 3c6 0 6 8 0 8m0 3c5 0 5 5 5 7", box: "m12 2 9 5v11l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v11M7 5l9 5v6",
  file: "M5 2h9l5 5v15H5ZM14 2v6h5M8 12h8M8 16h8", helmet: "M3 17v-4a9 9 0 0 1 18 0v4ZM9 3v9M15 3v9M1 18h22M3 22h18",
  database: "M21 5c0 5-18 5-18 0s18-5 18 0ZM3 5v5c0 5 18 5 18 0V5M3 10v5c0 5 18 5 18 0v-5M3 15v5c0 5 18 5 18 0v-5", alert: "m12 2 10 20H2ZM12 8v6M12 17v1",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0", calendar: "M3 5h18v17H3ZM7 2v6M17 2v6M3 11h18M7 15h2M13 15h2M7 19h2", check: "M4 12l5 5L20 4",
};
const ICONS: Record<string, string> = {
  search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0", layers: "m12 2 10 6-10 6L2 8ZM2 13l10 6 10-6M2 18l10 6 10-6",
  shield: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM8 12l3 3 5-6", alert: "M12 3 2 21h20ZM12 9v5M12 17v1", file: "M5 2h9l5 5v15H5ZM14 2v6h5M8 12h8M8 16h8",
  photo: "M3 7h4l2-3h6l2 3h4v14H3ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0", people: "M4 22v-4c0-5 12-5 12 0v4M14 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2ZM9 8h6M9 12h6M9 16h4", money: "M16 6c-1-3-7-3-8 1-1 3 2 4 2 7 0 2-2 4-3 5h11M5 12h10",
};
export const PHOTOS = ["/design/assets/reference-job-martin.jpg", "/design/assets/reference-job-harper.jpg", "/design/assets/reference-job-ocean.jpg"];
const TABS = [["today", "Today", "home"], ["jobs", "Jobs", "jobs"], ["check", "To check", "bell"], ["money", "Money", "money"], ["more", "More", "more"]] as const;
const UNKNOWN = "Details needed";
const TENANT_KEY = "jobguard-designed-workspace";

export function RailIcon({ name }: { name: string }) {
  return <svg className="rr-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={RAIL_ICONS[name] ?? RAIL_ICONS.file}/></svg>;
}
export function Icon({ name }: { name: string }) {
  return <svg className="icon" aria-hidden="true" viewBox="0 0 24 24"><path d={ICONS[name] ?? ICONS.file}/></svg>;
}
function Logo() {
  return <svg className="rr-logo-mark" viewBox="0 0 48 54" role="img" aria-label="JobGuard shield"><defs><linearGradient id="shield-gradient" x2="1" y2="1"><stop stopColor="#54e0dc"/><stop offset="1" stopColor="#06758e"/></linearGradient></defs><path d="M24 1 45 8v19c0 12-12 21-21 26C15 48 3 39 3 27V8Z" fill="url(#shield-gradient)"/><path d="M24 1v52c9-5 21-14 21-26V8Z" fill="#103643"/><path d="m24 10 12 4v12c0 7-6 13-12 17V30h-7v-9h13v-4l-6-2-7 3v8l-6 3V14Z" fill="#f6ffff"/><path d="M24 21h6v9h-6" fill="#64e5e4"/></svg>;
}
export function Tag({ tone = "", children }: { tone?: string; children: ReactNode }) { return <span className={`tag ${tone}`}>{children}</span>; }
export function Card({ title, sub, action, children, className = "", id }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return <section className={`card ${className}`} id={id}><div className="card-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>;
}
export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><Icon name="layers"/></div><h3>{title}</h3><p>{text}</p>{children}</div>;
}
export function Note({ tone = "", children }: { tone?: string; children: ReactNode }) { return <div className={`note ${tone}`}><Icon name={tone === "warning" ? "alert" : "shield"}/><div>{children}</div></div>; }
export function Head({ kicker, title, text, action }: { kicker: string; title: string; text: string; action?: ReactNode }) {
  return <div className="page-head"><div><div className="kicker">{kicker}</div><h2 tabIndex={-1}>{title}</h2><p>{text}</p></div>{action && <div className="head-buttons">{action}</div>}</div>;
}
/** An existing working tool shown inside a designed screen, keeping the app's own styles and behaviour. */
export function Legacy({ children, label }: { children: ReactNode; label: string }) {
  return <section className="jgd-legacy" aria-label={label}>{children}</section>;
}

export const known = (value: string) => value && value !== UNKNOWN ? value : "";
const initials = (name: string) => name.split(/\s+/u).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "JG";
export function money(pence: number | null | undefined) { return pence === null || pence === undefined ? "Not recorded yet" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
export function shortDate(iso: string) { const date = new Date(iso); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
export function documentLine(job: JobSummary) {
  const { kind, reference, delivery } = job.document;
  if (kind === "none") return "No quote sent yet";
  if (kind === "unknown") return "Open this job to check its documents";
  const name = `${kind === "quote" ? "Quote" : "Invoice"}${reference ? ` ${reference}` : ""}`;
  return delivery === "delivered" ? `${name} sent` : delivery === "queued" ? `${name} waiting to send — not sent yet` : delivery === "outcome_unknown" ? `${name} — we need to check whether it sent` : `${name} not sent`;
}
export const paymentLabels: Record<JobSummary["customerPayment"], string> = { not_due: "Customer payment not due yet", due: "Customer payment due", part_paid: "Customer has paid part", settled: "Customer has paid", unknown: "Payment not checked yet" };
export function statusTag(status: JobSummary["status"]) {
  const tone = status === "live" ? "blue" : status === "paid" || status === "accepted" ? "green" : status === "invoiced" ? "amber" : "";
  return <Tag tone={tone}>{jobStatusLabels[status]}</Tag>;
}
export function needsChecking(job: JobSummary) { return job.document.delivery === "queued" || job.document.delivery === "outcome_unknown" || job.customerPayment === "due"; }
export const siteOrTitle = (job: JobSummary) => known(job.siteLabel) || job.title;

export async function readJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 401) throw new Error("UNAUTHENTICATED");
  if (response.status === 403 || response.status === 404) throw new Error("FORBIDDEN");
  if (!response.ok) throw new Error("UNAVAILABLE");
  return response.json() as Promise<unknown>;
}

export const jobValueV1 = z.object({
  approvedExtras: z.object({ pence: z.number().int().nullable() }), invoicedGross: z.object({ pence: z.number().int().nullable() }),
  recordedGross: z.object({ pence: z.number().int().nullable() }), outstandingGross: z.object({ pence: z.number().int().nullable() }),
  pendingExtras: z.array(z.unknown()),
});
export type JobValue = z.infer<typeof jobValueV1>;
export const readValue = (jobId: string) => readJson(`/api/jobs/${encodeURIComponent(jobId)}/value`).then(raw => jobValueV1.parse(raw)).catch(() => null);

export const decisionsV1 = z.object({
  decisions: z.array(z.object({ id: z.string(), jobId: z.string(), jobLabel: z.string(), title: z.string(), detail: z.string(), classification: z.enum(["mandatory", "advisory"]), resolution: z.string() })),
  counts: z.object({ mandatory: z.number(), advisory: z.number(), pending: z.number() }),
});
export type Decisions = z.infer<typeof decisionsV1>;

export type Workspace = { session: SessionView; tenantId: string; pending: number; decisions: Decisions | null };
export type Load = { state: "loading" } | { state: "signed-out" } | { state: "error" } | { state: "ready"; workspace: Workspace };

function chosenTenant(session: SessionView) {
  let saved = "";
  try { saved = localStorage.getItem(TENANT_KEY) ?? ""; } catch { /* storage unavailable */ }
  return session.tenants.find(tenant => tenant.id === saved)?.id ?? session.tenants[0]?.id;
}

export function useWorkspace(): [Load, () => void] {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const session = sessionResponseV1.parse(await readJson("/api/session"));
        const tenantId = chosenTenant(session);
        if (!tenantId) throw new Error("UNAVAILABLE");
        const decisions = await readJson(`/api/decisions?tenantId=${encodeURIComponent(tenantId)}`).then(raw => decisionsV1.parse(raw)).catch(() => null);
        if (current) setLoad({ state: "ready", workspace: { session, tenantId, pending: decisions?.counts.pending ?? 0, decisions } });
      } catch (error) {
        if (current) setLoad({ state: error instanceof Error && error.message === "UNAUTHENTICATED" ? "signed-out" : "error" });
      }
    })();
    return () => { current = false; };
  }, [attempt]);
  return [load, () => { setLoad({ state: "loading" }); setAttempt(n => n + 1); }];
}

export function useJobs(tenantId: string) {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null), [failed, setFailed] = useState(false);
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
  return { jobs, failed };
}

const ROUTES: Record<string, string> = { today: "/today", jobs: "/jobs", check: "/check", money: "/money", more: "/more" };

export function Shell({ workspace, title, subtitle, active, onSearch, today = false, children }: { workspace: Workspace | null; title: string; subtitle: string; active: string; onSearch?: () => void; today?: boolean; children: ReactNode }) {
  const router = useRouter();
  const [panel, setPanel] = useState<"messages" | "settings" | "search" | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const name = workspace?.session.principal.displayName ?? "";
  const firstName = name.split(/\s+/u)[0] ?? "";
  const company = workspace?.session.tenants.find(tenant => tenant.id === workspace.tenantId)?.name ?? "Your practice workspace";
  const go = (tab: string) => router.push(ROUTES[tab] ?? "/today");
  const greeting = now ? `Good ${now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"}${firstName ? `, ${firstName}` : ""}.` : "";
  const date = now ? now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "") : "";
  const search = onSearch ?? (() => setPanel("search"));
  return <div className={`rr-app ${today ? "rr-is-today" : "rr-is-inner"}`} data-persona="owner">
    <a className="skip" href="#main">Skip to content</a>
    <aside id="sidebar" className="rr-rail">
      <a className="rr-brand" href="/today" onClick={event => { event.preventDefault(); go("today"); }}><Logo/><div><strong>JobGuard</strong><p>Run the job.<br/>Protect the profit.<br/>Get paid.</p></div><span className="rr-beta">BETA</span></a>
      <nav className="rr-navigation" aria-label="Main navigation">{TABS.map(([id, label, icon]) => <button key={id} type="button" className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} onClick={() => go(id)}><RailIcon name={icon}/><span>{label}</span>{id === "check" && <b>{workspace?.pending ?? 0}</b>}</button>)}</nav>
      <div className="rr-secondary-navigation"><button type="button" onClick={() => setPanel("search")}><RailIcon name="search"/><span>Search</span></button><button type="button" onClick={() => setPanel("messages")}><RailIcon name="message"/><span>Messages</span></button><button type="button" onClick={() => setPanel("settings")}><RailIcon name="settings"/><span>Settings</span></button></div>
      <button type="button" className="rr-account" onClick={() => setPanel("settings")}><span>{initials(name)}</span><div>{firstName || "Practice"}<small>Builder</small></div><RailIcon name="chevron"/></button>
      <div className="rr-rail-foot"><div className="rr-rail-photo"></div><p>BUILT<br/>FOR BUILDERS.<br/>BACKED BY<br/>EVIDENCE.</p></div>
    </aside>
    <main className="rr-main" id="main">
      <header className="rr-header"><div className="rr-company">{company.toUpperCase()}</div><h1>{title}</h1><p className="rr-subtitle">{subtitle}</p>
        <div className="rr-header-tools"><button type="button" className="rr-search" onClick={search}><RailIcon name="search"/><span>Search jobs, suppliers, invoices...</span></button><button className="rr-round rr-notify" type="button" aria-label="Things needing attention" onClick={() => go("check")}><RailIcon name="bell"/>{(workspace?.pending ?? 0) > 0 && <i></i>}</button><button className="rr-round" type="button" aria-label={`${firstName || "Your"} profile`} onClick={() => setPanel("settings")}>{initials(name)}</button></div>
        <div className="rr-date"><span>{date}</span><span>{greeting}</span></div>
      </header>
      <div id="reference-content" className={today ? "" : "rr-inner-content"}>{children}</div>
      <footer className="rr-footer"><span>Practice workspace · fictional records · no real messages, invoices or payments sent</span></footer>
    </main>
    <nav className="rr-mobile-nav" aria-label="Mobile navigation">{TABS.map(([id, label, icon]) => <button key={id} type="button" className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} onClick={() => go(id)}><RailIcon name={icon}/><span>{label}</span></button>)}</nav>
    {panel === "search" && <SearchPanel tenantId={workspace?.tenantId ?? ""} close={() => setPanel(null)}/>}
    {panel === "messages" && <Panel title="Your messages" text="No real customer or supplier messages are connected to this practice workspace." close={() => setPanel(null)}><div className="rr-empty-inbox"><RailIcon name="message"/><h3>Nothing has been sent.</h3><p>Each job’s customer messages and diary are in its Records tab.</p></div></Panel>}
    {panel === "settings" && workspace && <SettingsPanel workspace={workspace} close={() => setPanel(null)}/>}
  </div>;
}

export function Panel({ title, text, close, children }: { title: string; text: string; close: () => void; children?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); }, []);
  return <dialog ref={ref} className="rr-assist" onClose={close}><div className="rr-assist-head"><h2>{title}</h2><button type="button" aria-label="Close" onClick={() => ref.current?.close()}><RailIcon name="close"/></button></div><p>{text}</p>{children}</dialog>;
}

function SearchPanel({ tenantId, close }: { tenantId: string; close: () => void }) {
  const router = useRouter();
  const { jobs } = useJobs(tenantId);
  const [term, setTerm] = useState("");
  const found = useMemo(() => (jobs ?? []).filter(job => `${job.title} ${job.siteLabel} ${job.customerLabel}`.toLowerCase().includes(term.toLowerCase())), [jobs, term]);
  return <Panel title="Find it in JobGuard" text="Search the practice jobs in this workspace." close={close}>
    <label className="rr-search-field">Search jobs<input type="search" placeholder="Try kitchen…" autoFocus value={term} onChange={event => setTerm(event.target.value)}/></label>
    <div className="rr-search-results">{jobs === null ? <p>Loading…</p> : found.length ? found.map(job => <button key={job.id} type="button" onClick={() => { close(); router.push(`/jobs/${job.id}/overview`); }}><strong>{job.title}</strong><small>{known(job.siteLabel) || jobStatusLabels[job.status]}</small><RailIcon name="arrow"/></button>) : <p>No matching practice jobs.</p>}</div>
  </Panel>;
}

function SettingsPanel({ workspace, close }: { workspace: Workspace; close: () => void }) {
  function choose(id: string) { try { localStorage.setItem(TENANT_KEY, id); } catch { /* storage unavailable */ } window.location.reload(); }
  return <Panel title={`${workspace.session.principal.displayName}’s practice workspace`} text="Signed in to a synthetic demo only. Nothing here can send a message, take a payment or create a JobGuard fee." close={close}>
    <div className="rr-profile-options">{workspace.session.tenants.map(tenant => <button key={tenant.id} type="button" aria-pressed={tenant.id === workspace.tenantId} onClick={() => choose(tenant.id)}>{tenant.id === workspace.tenantId ? "✓ " : ""}{tenant.name}</button>)}<a href="/more">Practice tools and contractor views →</a></div>
  </Panel>;
}

export function StateScreen({ load, retry, title, active = "jobs" }: { load: Load; retry: () => void; title: string; active?: string }) {
  const [busy, setBusy] = useState(false);
  async function signIn() { setBusy(true); try { await fetch("/api/session", { method: "POST" }); } finally { setBusy(false); retry(); } }
  const body = load.state === "loading" ? <Card title="Getting your jobs ready"><div className="card-body"><p aria-live="polite">Loading…</p></div></Card>
    : load.state === "signed-out" ? <Card title="Open the practice workspace"><div className="card-body"><p>This uses made-up jobs only. Nothing is sent or charged.</p><div style={{ marginTop: 18 }}><button type="button" className="btn primary" disabled={busy} onClick={() => void signIn()}>Open the practice workspace →</button></div></div></Card>
    : <Card title="Your jobs did not load"><div className="card-body"><p role="alert">Nothing changed. Please try again.</p><div style={{ marginTop: 18 }}><button type="button" className="btn primary" onClick={retry}>Try again</button></div></div></Card>;
  return <Shell workspace={null} title={title} subtitle="One place to manage the job, spot problems early and know what comes next." active={active}><div className="rr-state">{body}</div></Shell>;
}

/** Loads the session, then renders a screen; handles sign-in, loading and failure in the design. */
export function Screen({ title, active, children }: { title: string; active: string; children: (workspace: Workspace) => ReactNode }) {
  const [load, retry] = useWorkspace();
  if (load.state !== "ready") return <StateScreen load={load} retry={retry} title={title} active={active}/>;
  return <>{children(load.workspace)}</>;
}
