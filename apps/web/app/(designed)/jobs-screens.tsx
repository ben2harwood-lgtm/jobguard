"use client";

// Jobs list, a job's four tabs and starting a new job, in the approved design.
// Routes: /api/jobs, /api/jobs/[id], /api/jobs/[id]/value, /api/jobs/[id]/things-to-check, /api/jobs/[id]/parties.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { jobsResponseV1, type JobSummary } from "../lib/contracts";
import { jobWorkspaceResponseV1, type JobWorkspaceResponse } from "@jobguard/api/workspace-contracts";
import { jobStatusLabels } from "../ui/workspace-lifecycle";
import { WalkIt } from "../ui/jobguard-app";
import { Card, Empty, Head, Icon, Legacy, Note, PHOTOS, Screen, Shell, Tag, agreedLine, useJobFacts, useAttention, onJobRefresh, type AttentionLink, catchLabel, type JobFacts, quoteLine, documentLine, known, money, readJson, shortDate, statusTag, useJobs, type JobValue, type Workspace } from "./designed-ui";

const LIST_SUBTITLE = "One place to manage the job, spot problems early and know what comes next.";

export function DesignedJobs() {
  return <Screen title="Your jobs." active="jobs">{workspace => <JobsList workspace={workspace}/>}</Screen>;
}

export function JobsList({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const { jobs, failed } = useJobs(workspace.tenantId);
  const facts = useJobFacts(workspace.tenantId, (jobs ?? []).map(job => job.id));
  const attention = useAttention(workspace, jobs, facts);
  const [filter, setFilter] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => (jobs ?? []).filter(job => `${job.title} ${job.siteLabel} ${job.customerLabel}`.toLowerCase().includes(filter.toLowerCase())), [jobs, filter]);
  return <Shell workspace={workspace} title="Your jobs." subtitle={LIST_SUBTITLE} active="jobs" onSearch={() => searchRef.current?.focus()}>
    <Head kicker="MY WORK" title="All your jobs" text="One place for what was agreed, who is working, what arrived and what the job is worth." action={<button type="button" className="btn primary" onClick={() => router.push("/jobs/new")}>New job +</button>}/>
    <Card title="Jobs" action={<button type="button" className="btn primary small" onClick={() => router.push("/jobs/new")}>New job +</button>}>
      <div className="toolbar"><label className="search"><Icon name="search"/><input ref={searchRef} type="search" aria-label="Search jobs" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search jobs, sites or customers…"/></label><Tag>{visible.length} {visible.length === 1 ? "job" : "jobs"}</Tag></div>
      <div data-testid="designed-jobs-list">
        {failed ? <Empty title="Your jobs did not load" text="Nothing changed. Refresh the page to try again."/>
          : jobs === null ? <Empty title="Loading your jobs…" text="This takes a moment."/>
          : visible.length === 0 ? <Empty title={jobs.length ? "No matching jobs" : "No jobs yet"} text={jobs.length ? "Try a shorter search or clear the search box." : "Start a new job to see it here."}>{!jobs.length && <button type="button" className="btn primary" onClick={() => router.push("/jobs/new")}>Start a new job</button>}</Empty>
          : visible.map((job, index) => <article className="job-row" key={job.id}>
            <img className="job-photo" src={PHOTOS[index % PHOTOS.length]} alt="Illustrative building"/>
            <div className="job-name"><strong>{job.title}</strong><small>{[known(job.siteLabel) || "Site details needed", known(job.customerLabel) || "Customer details needed", job.updatedLabel].filter(Boolean).join(" · ")}</small><p>{quoteLine(job)} · {agreedLine(facts?.[job.id])} · {facts?.[job.id]?.payment?.paymentStatus ?? "Payment status unavailable"} · recorded by you, not bank-confirmed</p></div>
            <div className="job-side"><strong>{jobStatusLabels[job.status]}</strong>{attention.items.some(item => item.id === job.id) ? <Tag tone="amber">1 to check</Tag> : statusTag(job.status)}<button type="button" className="btn small" onClick={() => router.push(`/jobs/${job.id}/overview`)}>Open job →</button></div>
          </article>)}
      </div>
    </Card>
  </Shell>;
}

export function DesignedNewJob() {
  return <Screen title="Start a new job." active="jobs">{workspace => <NewJob workspace={workspace}/>}</Screen>;
}
function NewJob({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  return <Shell workspace={workspace} title="Start a new job." subtitle="Describe the work in your own words. JobGuard makes a draft for you to check — nothing is sent yet." active="jobs">
    <Head kicker="NEW JOB" title="Describe the work" text="Type or paste what you plan to do. You can check and change everything before a quote."/>
    <Legacy label="Start a new job" cards><WalkIt tenantId={workspace.tenantId} close={() => router.push("/jobs")} reviewHref={id => `/jobs/${id}/work`}/></Legacy>
  </Shell>;
}

const partiesV1 = z.object({ current: z.object({
  customer: z.object({ name: z.string() }).nullable().optional(), payingParty: z.object({ name: z.string() }).nullable().optional(),
  site: z.object({ addressLines: z.array(z.string()), town: z.string().optional(), postcode: z.string().optional() }).nullable().optional(),
}).nullable() });
type Detail = { job: JobWorkspaceResponse["job"]; summary: JobSummary | null; value: JobValue | null; checks: number | null; photo: string; facts?: JobFacts | undefined; attentionReasons?: string[]; attentionComplete?: boolean; attentionFailed?: boolean; attentionLinks?: AttentionLink[] };
export type JobTab = "overview" | "work" | "money" | "records";

export function useJobDetail(jobId: string, tenantId: string) {
  const [detail, setDetail] = useState<Detail | null>(null), [failed, setFailed] = useState<"forbidden" | "unavailable" | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => onJobRefresh([jobId], () => setRefresh(n => n + 1)), [jobId]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    // Keep Work mounted while its commands refresh this same job. Clearing it
    // resets the proof, final-account and invoice panels between command steps.
    // The returned identity guard still hides a different job or tenant immediately.
    setFailed(null);
    const id = encodeURIComponent(jobId);
    (async () => {
      const response = await fetch(`/api/jobs/${id}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) { if (current) { setDetail(null); setFailed([401, 403, 404].includes(response.status) ? "forbidden" : "unavailable"); } return; }
      const { job } = jobWorkspaceResponseV1.parse(await response.json());
      if (job.id !== jobId || job.tenantId !== tenantId) throw new Error("WRONG_JOB_RESPONSE");
      const list = await readJson(`/api/jobs?tenantId=${encodeURIComponent(tenantId)}`, controller.signal).then(raw => { const list = jobsResponseV1.parse(raw); if (list.tenantId !== tenantId || list.jobs.some(item => item.tenantId !== tenantId)) throw new Error("WRONG_WORKSPACE_RESPONSE"); return list.jobs; });
      const index = Math.max(0, list.findIndex(item => item.id === job.id));
      if (current) setDetail({ job, summary: list.find(item => item.id === job.id) ?? null, value: null, checks: null, photo: PHOTOS[index % PHOTOS.length]! });
    })().catch(() => { if (current) { setDetail(null); setFailed("unavailable"); } });
    return () => { current = false; controller.abort(); };
  }, [tenantId, jobId, refresh]);
  return { detail: detail?.job.id === jobId && detail.job.tenantId === tenantId ? detail : null, failed };
}

/** One job, any tab: the design's job header and tabs, with the tab's content below. */
export function DesignedJob({ jobId, tab, children }: { jobId: string; tab: JobTab; children?: ReactNode }) {
  return <Screen title="Your job" active="jobs">{workspace => <JobFrame key={`${workspace.tenantId}:${jobId}`} workspace={workspace} jobId={jobId} tab={tab}>{children}</JobFrame>}</Screen>;
}

function JobFrame({ workspace, jobId, tab, children }: { workspace: Workspace; jobId: string; tab: JobTab; children?: ReactNode }) {
  const router = useRouter();
  const { detail: loadedDetail, failed } = useJobDetail(jobId, workspace.tenantId);
  const facts = useJobFacts(workspace.tenantId, [jobId]);
  const attention = useAttention(workspace, loadedDetail?.summary ? [loadedDetail.summary] : null, facts);
  const detail = loadedDetail ? { ...loadedDetail, value: facts?.[jobId]?.value ?? null, facts: facts?.[jobId], checks: attention.items[0]?.reasons.length ?? (attention.complete ? 0 : null), attentionReasons: attention.items[0]?.reasons ?? [], attentionComplete: attention.complete, attentionFailed: attention.failed, attentionLinks: attention.items[0]?.links ?? [] } : null;
  if (failed || !detail) return <Shell workspace={workspace} title="Your job" subtitle="Overview, work, money and records — together." active="jobs">
    {failed ? <Card title={failed === "forbidden" ? "You cannot open this job" : "Your job could not load"}><div className="card-body"><p role="alert">{failed === "forbidden" ? "Use a job available to this practice session." : "Nothing changed. Refresh the page to try again."}</p><div style={{ marginTop: 18 }}><button type="button" className="btn primary" onClick={() => router.push("/jobs")}>Back to jobs</button></div></div></Card>
      : <Card title="Loading your job…"><div className="card-body"><p aria-live="polite">This takes a moment.</p></div></Card>}
  </Shell>;
  const { job, summary } = detail;
  const site = summary ? known(summary.siteLabel) : "", customer = summary ? known(summary.customerLabel) : "";
  const tabs: [JobTab, string][] = [["overview", "Overview"], ["work", "Work"], ["money", "Money"], ["records", "Records"]];
  return <Shell workspace={workspace} title={job.title} subtitle={[site, customer].filter(Boolean).join(" · ") || "Site and customer details still needed"} active="jobs">
    <div className="job-header"><Head kicker={`JOB ${job.id.slice(0, 8).toUpperCase()}`} title={job.title} text={[site || "Site details needed", customer || "Customer details needed"].join(" · ")}/></div>
    <div className="job-caption" style={{ margin: "-12px 0 19px" }} data-testid={`designed-job-${tab}`} data-job-id={job.id}>{statusTag(job.status)} {detail.attentionReasons.length ? <Tag tone="amber">Needs attention</Tag> : detail.attentionComplete ? <Tag tone="green">No current alerts</Tag> : <Tag>{detail.attentionFailed ? "Some job checks could not be loaded" : "Loading job checks…"}</Tag>} <span>Updated {shortDate(job.updatedAt)}</span></div>
    <nav className="job-tabs" aria-label="Job sections">{tabs.map(([id, label]) => <button key={id} type="button" className={id === tab ? "active" : ""} aria-current={id === tab ? "page" : undefined} onClick={() => router.push(`/jobs/${job.id}/${id}`)}>{label}</button>)}</nav>
    {tab === "overview" ? <Overview detail={detail} site={site}/> : tab === "work" ? <WorkTab>{children}</WorkTab> : tab === "money" ? <MoneyTab value={detail.value} status={job.status} facts={detail.facts}>{children}</MoneyTab> : <RecordsTab jobId={job.id}>{children}</RecordsTab>}
  </Shell>;
}

function nextAction(job: Detail["job"], summary: JobSummary | null, facts?: JobFacts): { title: string; body: string; label: string; tab: JobTab } {
  if (facts?.payment?.state === "paid" && facts.checksAvailable) return { title: "Customer invoices paid", body: "See the saved payments and job history. Payment alone does not confirm that site work is finished.", label: "See the money trail", tab: "money" };
  if (summary && (summary.document.delivery === "queued" || summary.document.delivery === "outcome_unknown")) return { title: "Check whether the quote was sent", body: documentLine(summary) + ".", label: "Check the quote", tab: "work" };
  switch (job.status) {
    case "draft": return { title: "Finish describing the work", body: "Check the draft before a quote is prepared. Nothing is sent yet.", label: "Open the draft", tab: "work" };
    case "quoting": return { title: "Price and send the quote", body: "Price the checked work, preview the quote, then choose to send it.", label: "Price the work", tab: "work" };
    case "accepted": return { title: "Start the work", body: "The customer said yes. Switch the job on when the work begins.", label: "Start the job", tab: "work" };
    case "live": return { title: "Keep the job record up to date", body: "Add proof photos and log any extra work as it happens, so nothing is forgotten.", label: "Record the work", tab: "work" };
    case "invoiced": return { title: "Watch for the customer’s payment", body: "The invoice is recorded. A payment you enter by hand is not a bank-confirmed receipt.", label: "Check the money", tab: "money" };
    case "paid": return { title: "Check the saved money records", body: "Review the invoices, payments and credits recorded for this job.", label: "See the money trail", tab: "money" };
    case "lost": return { title: "This job did not go ahead", body: "The record is kept for reference.", label: "Open the records", tab: "records" };
  }
}

function MoneyBlocks({ value, wide = false }: { value: JobValue | null; wide?: boolean }) {
  return <div className="detail-grid">
    <div className="detail-block"><small>Approved extras</small><strong>{money(value?.approvedExtras.pence)}</strong><p>Not automatically invoiced.</p></div>
    <div className="detail-block"><small>Invoiced</small><strong>{money(value?.invoicedGross.pence)}</strong><p>Including VAT.</p></div>
    <div className="detail-block"><small>Recorded as paid</small><strong>{money(value?.recordedGross.pence)}</strong><p>Entered by hand, not bank-confirmed.</p></div>
    <div className="detail-block"><small>Still owed</small><strong>{money(value?.outstandingGross.pence)}</strong><p>Invoiced but not yet recorded as paid.</p></div>
    <div className={`detail-block ${wide ? "" : "wide"}`}><small>Priced extras waiting for a customer decision</small><strong>{value ? value.pendingExtras.length : "Not recorded yet"}</strong><p>Not included in the approved amounts above.</p></div>
  </div>;
}

export function Overview({ detail, site }: { detail: Detail; site: string }) {
  const router = useRouter();
  const { job, summary, value, checks, photo } = detail;
  const open = (tab: JobTab) => router.push(`/jobs/${job.id}/${tab}`);
  const catchAction = detail.facts?.value?.catchAttention[0];
  const action = catchAction ? { title: "Review the saved extra", body: catchLabel(catchAction), label: "Open the extra", tab: "work" as const } : detail.facts?.blocker ? { title: "This bill stays locked", body: detail.facts.blocker, label: "Open Work / Final Check", tab: "work" as const } : nextAction(job, summary, detail.facts);
  return <>
    {(detail.attentionLinks ?? detail.attentionReasons?.map(label => ({ label, href: `/jobs/${job.id}/work#final-account-title` })) ?? []).map((link, i) => <Note key={i} tone="warning">{link.label} <a href={link.href}>{link.href.includes("#variation-") ? "Open saved extra →" : "Open Work / Final Check →"}</a></Note>)}
    {detail.attentionFailed && <p role="status">Some job checks could not be loaded</p>}
    {!detail.attentionComplete && !detail.attentionFailed && <p role="status">Loading job checks…</p>}
    <div className="job-spot">
      <Card title="The job at a glance"><div className="photo-card"><img src={photo} alt="Illustrative photograph of a property"/><div className="photo-copy"><p className="photo-disclosure">Illustrative photograph of a property</p><div className="kicker">AGREED WORK</div><h3>{job.title}</h3><p style={{ fontSize: 12, lineHeight: 1.8 }}>{job.scopeIdentityIds.length ? `${job.scopeIdentityIds.length} confirmed ${job.scopeIdentityIds.length === 1 ? "item" : "items"} of work.` : "The agreed work has not been confirmed yet."}</p><div className="job-caption"><Tag tone="blue">{quoteLine(summary ?? { status: job.status, document: { kind: "unknown", reference: null, delivery: "unknown" } })}</Tag></div><button type="button" className="btn small" onClick={() => open("work")}>Open the work plan →</button></div></div></Card>
      <Card title="Next action"><div className="card-body"><div className="kicker">JOBGUARD SUGGESTS</div><h3 style={{ fontSize: 17, margin: "8px 0" }}>{action.title}</h3><p>{action.body}</p><div style={{ marginTop: 20 }}><button type="button" className="btn primary wide" onClick={() => catchAction ? router.push(`/jobs/${job.id}/work#variation-${catchAction.id}`) : detail.facts?.blocker ? router.push(`/jobs/${job.id}/work#final-account-title`) : open(action.tab)}>{action.label} →</button></div></div></Card>
    </div>
    <div className="two-col">
      <div><Card title="What JobGuard is watching" sub="The checks come from this job’s practice records." action={<button type="button" className="btn ghost small" onClick={() => open("work")}>See all →</button>}>
        {checks ? <article className="risk-row compact"><div className="risk-icon"><Icon name="alert"/></div><div className="risk-copy"><div className="risk-kicker"><span>{site || job.title}</span><Tag tone="amber">Needs attention</Tag></div><h3>{checks} {checks === 1 ? "thing" : "things"} to check on this job</h3><p>Review them before they cost you time or money.</p><div className="risk-source">Why we flagged it: Things to check on this job</div></div><div className="risk-action"><button type="button" className="btn small primary" onClick={() => open("work")}>Review →</button></div></article>
          : <Empty title={!detail.attentionComplete && !detail.attentionFailed ? "Loading job checks…" : checks === null || !detail.attentionComplete ? "Job checks unavailable" : detail.attentionReasons?.length ? "Review the items above" : "No urgent checks"} text={!detail.attentionComplete && !detail.attentionFailed ? "Checking the saved job records." : checks === null || !detail.attentionComplete ? "We could not load the checks for this job. Open Work to see them." : detail.attentionReasons?.length ? "Open Work to review the saved checks." : "Nothing in this job currently needs an owner decision."}/>}
      </Card></div>
      <div><Card title="Money on this job"><div className="card-body">
        <div className="detail-block"><small>Agreed with the customer</small><strong>{agreedLine(detail.facts)}</strong></div>
        <p>{detail.facts?.payment?.paymentStatus ?? "Payment status unavailable"} · recorded by you, not bank-confirmed</p>
        <MoneyBlocks value={value}/>
        <div className="divider"></div>
        <Note>These figures come from this job’s practice records. A manually entered payment is not a bank-confirmed receipt.</Note>
        <div style={{ marginTop: 14 }}><button type="button" className="btn small primary" onClick={() => open("money")}>See the money trail →</button></div>
      </div></Card></div>
    </div>
    <div style={{ marginTop: 18 }}><Card title="Coming up"><div className="mini-calendar">
      <div className="date-row"><strong>Status</strong><span>{jobStatusLabels[job.status]}</span></div>
      <div className="date-row"><strong>Quote or invoice</strong><span>{summary ? documentLine(summary) : "Not checked yet"}</span></div>
      <div className="date-row"><strong>Customer payment</strong><span>{detail.facts?.payment?.paymentStatus ?? "Payment status unavailable"} · recorded by you, not bank-confirmed</span></div>
      <div className="date-row"><strong>Last updated</strong><span>{shortDate(job.updatedAt)}</span></div>
      <button type="button" className="btn primary small" onClick={() => open("work")}>Review the work →</button>
    </div></Card></div>
  </>;
}

function WorkTab({ children }: { children?: ReactNode }) {
  return <>
    <Head kicker="WORK / ONE CONNECTED JOB" title="Keep the work ready." text="The quote, materials, proof and extras belong to this job. A change here updates what JobGuard flags."/>
    <Legacy label="Job workspace" cards>{children}</Legacy>
  </>;
}

export function MoneyTab({ value, facts, children }: { value: JobValue | null; status: JobSummary["status"]; facts?: JobFacts | undefined; children?: ReactNode }) {
  return <>
    <Head kicker="MONEY / ONE CONNECTED JOB" title="Follow every pound." text="Keep the quote, extras, invoices and payments separate — so nothing gets counted twice."/>
    <Card title="Where the money stands" action={<Tag tone="blue">From practice records</Tag>}><div className="card-body">
      <div className="detail-block"><small>Agreed with the customer</small><strong>{agreedLine(facts)}</strong></div>
      <p>{facts?.payment?.paymentStatus ?? "Payment status unavailable"} · recorded by you, not bank-confirmed</p>
      <MoneyBlocks value={value}/>
      <div style={{ marginTop: 16 }}><Note>An extra being approved does not mean it has been invoiced. An invoice being issued does not mean the customer has paid. A manually entered receipt does not prove bank settlement.</Note></div>
    </div></Card>
    <div style={{ marginTop: 19 }}><Legacy label="Job money trail" cards>{children}</Legacy></div>
  </>;
}

function RecordsTab({ jobId, children }: { jobId: string; children?: ReactNode }) {
  const router = useRouter();
  const [parties, setParties] = useState<z.infer<typeof partiesV1>["current"] | undefined>(undefined);
  useEffect(() => { let current = true; readJson(`/api/jobs/${encodeURIComponent(jobId)}/parties`).then(raw => { if (current) setParties(partiesV1.parse(raw).current); }).catch(() => { if (current) setParties(null); }); return () => { current = false; }; }, [jobId]);
  const site = parties?.site ? [...parties.site.addressLines, parties.site.town, parties.site.postcode].filter(Boolean).join(", ") : "";
  const links: [string, string, string][] = [["retention-records", "Retention records", "What is kept, for how long, and why."], ["evidence-holds", "Evidence holds", "Records held back from deletion while a question is open."], ["imports", "Imported records", "Files brought in from other systems."]];
  return <>
    <Head kicker="RECORDS / KEEP THE EVIDENCE" title="Know what happened, and why." text="Instructions, approvals and proof stay linked to the job, rather than scattered across apps."/>
    <div className="equal-col">
      <div>
        <Card title="Who and where" sub="The customer, the site and who pays, as recorded on this job."><div className="card-body">
          {parties === undefined ? <p aria-live="polite">Loading…</p> : <div className="detail-grid">
            <div className="detail-block"><small>Customer</small><strong>{parties?.customer?.name ?? "Not recorded yet"}</strong></div>
            <div className="detail-block"><small>Who pays</small><strong>{parties?.payingParty?.name ?? "Not recorded yet"}</strong></div>
            <div className="detail-block wide"><small>Site</small><strong>{site || "Not recorded yet"}</strong></div>
          </div>}
          <div style={{ marginTop: 14 }}><button type="button" className="btn small" onClick={() => router.push(`/jobs/${jobId}/work`)}>Change in Work →</button></div>
        </div></Card>
        <div style={{ marginTop: 18 }}><Card title="Kept records"><div className="work-list">{links.map(([path, title, text]) => <div className="work-item" key={path}><div className="work-item-icon"><Icon name="file"/></div><div className="work-text"><strong>{title}</strong><small>{text}</small></div><a className="btn small" href={`/jobs/${jobId}/${path}`}>Open →</a></div>)}</div></Card></div>
      </div>
      <div><Legacy label="Job diary and messages" cards>{children}</Legacy></div>
    </div>
  </>;
}
