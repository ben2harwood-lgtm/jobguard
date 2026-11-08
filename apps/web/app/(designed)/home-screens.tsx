"use client";

// Today, To check, Money and More, in the approved design.
// Routes: /api/session, /api/decisions, /api/jobs, /api/jobs/[id]/value.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobSummary } from "../lib/contracts";
import { jobStatusLabels } from "../ui/workspace-lifecycle";
import { DecisionInbox } from "../ui/decision-inbox";
import { VariationFlow } from "../ui/variation-flow";
import { ProofCapture } from "../ui/proof-capture";
import { FinalAccount } from "../ui/final-account";
import { FeeStatement } from "../ui/fee-statement";
import { Card, Empty, Head, Legacy, Note, PHOTOS, RailIcon, Screen, Shell, Tag, documentLine, known, money, needsChecking, readValue, statusTag, useJobs, type JobValue, type Workspace } from "./designed-ui";

const INNER_SUBTITLE = "One place to manage the job, spot problems early and know what comes next.";

function useValues(jobs: JobSummary[] | null) {
  const [values, setValues] = useState<Record<string, JobValue | null> | null>(null);
  useEffect(() => {
    if (!jobs) return;
    let current = true;
    Promise.all(jobs.map(async job => [job.id, await readValue(job.id)] as const)).then(entries => { if (current) setValues(Object.fromEntries(entries)); });
    return () => { current = false; };
  }, [jobs]);
  return values;
}
function total(values: Record<string, JobValue | null> | null, pick: (value: JobValue) => number | null) {
  if (!values) return undefined;
  const amounts = Object.values(values).flatMap(value => { const pence = value ? pick(value) : null; return pence === null ? [] : [pence]; });
  return amounts.length ? amounts.reduce((sum, pence) => sum + pence, 0) : null;
}

// ---------- Today ----------
export function DesignedToday() {
  return <Screen title="Your jobs, under control." active="today">{workspace => <Today workspace={workspace}/>}</Screen>;
}

const STAGES: [string, JobSummary["status"][]][] = [["Draft", ["draft"]], ["Quote", ["quoting"]], ["Accepted", ["accepted"]], ["Work", ["live"]], ["Invoiced", ["invoiced"]], ["Paid", ["paid"]]];
const ATTENTION_PHOTOS = ["crew", "boards", "invoice"];

function Today({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const { jobs, failed } = useJobs(workspace.tenantId);
  const open = (workspace.decisions?.decisions ?? []).filter(item => item.resolution === "open");
  const shown = open.slice(0, 3);
  const active = (jobs ?? []).filter(job => job.status !== "lost" && job.status !== "paid");
  const featured = (jobs ?? []).find(job => job.status === "live") ?? jobs?.[0];
  const [featuredValue, setFeaturedValue] = useState<JobValue | null>(null);
  useEffect(() => { if (featured) void readValue(featured.id).then(setFeaturedValue); }, [featured]);
  const stage = featured ? STAGES.findIndex(([, statuses]) => statuses.includes(featured.status)) : -1;
  return <Shell workspace={workspace} today title="Your jobs, under control." subtitle="JobGuard watches your jobs, flags problems early and helps you get paid for everything you’re entitled to." active="today">
    <section className="rr-dashboard" aria-label="Today dashboard" data-testid="designed-today">
      <div className="rr-metrics">
        <button type="button" className="rr-metric rr-glass" onClick={() => router.push("/jobs")}><span className="rr-medallion mint"><RailIcon name="helmet"/></span><span><strong>{jobs ? active.length : "…"}</strong><small>jobs in progress</small></span><RailIcon name="chevron"/></button>
        <button type="button" className="rr-metric rr-glass" onClick={() => router.push("/check")}><span className="rr-medallion orange"><RailIcon name="alert"/></span><span><strong>{workspace.pending}</strong><small>need attention</small></span><RailIcon name="chevron"/></button>
        <button type="button" className="rr-metric rr-glass rr-cost-metric" onClick={() => router.push("/money")}><span className="rr-medallion mint"><RailIcon name="database"/></span><span><b>Money by job</b><small>Invoices and payments are kept separate</small></span><RailIcon name="chevron"/></button>
      </div>
      <div className="rr-main-grid">
        <section className="rr-attention rr-glass"><div className="rr-section-head"><h2>What needs you today</h2><button type="button" className="rr-text-button" onClick={() => router.push("/check")}>View all ({open.length})</button></div>
          <div className="rr-attention-list">{shown.length ? shown.map((item, index) => <article className="rr-attention-row" key={item.id}>
            <span className={`rr-photo rr-photo-${ATTENTION_PHOTOS[index % 3]}`} role="img" aria-label="Illustrative image"></span>
            <span className="rr-medallion orange"><RailIcon name={item.classification === "mandatory" ? "alert" : "file"}/></span>
            <div className="rr-attention-copy"><h3>{item.title}</h3><p>{item.detail}</p><div className="rr-attention-bottom"><div className="rr-pills"><span>{item.jobLabel}</span><span>{item.classification === "mandatory" ? "Must decide" : "Worth a look"}</span></div><button type="button" className="rr-button" onClick={() => router.push("/check")}>Review <RailIcon name="arrow"/></button></div></div>
          </article>) : <div className="rr-clear"><h3>No immediate action</h3><p>Nothing needs a decision right now. Your job records are below.</p></div>}</div>
        </section>
        {featured ? <section className="rr-feature rr-glass" aria-label={`Featured job: ${featured.title}`}>
          <div className="rr-feature-art"><div className="rr-feature-heading"><span className="rr-status green"><i></i>{jobStatusLabels[featured.status].toUpperCase()}</span><h2>{featured.title}</h2><p>{known(featured.customerLabel) || "Customer details needed"}</p><div className="rr-location"><RailIcon name="pin"/><span>{known(featured.siteLabel) || "Site details needed"}</span><b></b><RailIcon name="calendar"/><span>{featured.updatedLabel}</span><button type="button" className="rr-icon-button" aria-label={`Open ${featured.title}`} onClick={() => router.push(`/jobs/${featured.id}/overview`)}><RailIcon name="chevron"/></button></div></div>
            <div className="rr-paper"><div className="rr-paper-top"><span>{featured.document.reference ?? "Job record"}</span><button type="button" className="rr-paper-menu" aria-label="Open job records" onClick={() => router.push(`/jobs/${featured.id}/records`)}>•••</button></div><p>{featured.title}<br/>{known(featured.siteLabel) || "Site details needed"}</p><ul>{STAGES.slice(1).map(([label], index) => <li key={label}>{index + 1 < stage ? <RailIcon name="check"/> : <span></span>}{label}</li>)}</ul></div>
          </div>
          <div className="rr-feature-bottom">
            <div className="rr-stage-rail" data-stage={stage} aria-label="Job stages">{STAGES.map(([label], index) => <button key={label} type="button" className={index < stage ? "done" : index === stage ? "current" : ""} onClick={() => router.push(`/jobs/${featured.id}/${index >= 4 ? "money" : "work"}`)}><span>{index < stage && <RailIcon name="check"/>}</span><small>{label}</small></button>)}</div>
            <div className="rr-financials">{([["Approved extras", featuredValue?.approvedExtras.pence], ["Invoiced", featuredValue?.invoicedGross.pence], ["Paid", featuredValue?.recordedGross.pence], ["Still owed", featuredValue?.outstandingGross.pence]] as const).map(([label, pence]) => <div key={label}><span>{label}{label === "Paid" && <> <small title="Manually entered, not verified bank settlement">ⓘ</small></>}</span><strong title={pence === null || pence === undefined ? "Not recorded yet" : undefined}>{pence === null || pence === undefined ? "—" : money(pence).replace(/\.00$/u, "")}</strong></div>)}</div>
          </div>
        </section> : <section className="rr-feature rr-glass"><Empty title={failed ? "Your jobs did not load" : jobs ? "No jobs yet" : "Loading your jobs…"} text={jobs && !jobs.length ? "Start a new job to see it here." : "This takes a moment."}/></section>}
      </div>
      <section className="rr-your-jobs rr-glass"><div className="rr-section-head"><h2>Your jobs</h2><div><button type="button" className="rr-text-button" onClick={() => router.push("/jobs")}>View all jobs <RailIcon name="arrow"/></button><button type="button" className="rr-button" onClick={() => router.push("/jobs/new")}><RailIcon name="plus"/> New quote</button></div></div>
        <div className="rr-job-grid">{(jobs ?? []).slice(0, 3).map((job, index) => <article className="rr-mini-job" key={job.id}>
          <button type="button" className="rr-mini-photo" aria-label={`Open ${job.title}`} onClick={() => router.push(`/jobs/${job.id}/overview`)}><span className={`rr-photo rr-photo-${["job-martin", "job-harper", "job-ocean"][index % 3]}`} role="img" aria-label="Illustrative image"></span></button>
          <div className="rr-mini-copy"><div className="rr-mini-top"><span className={`rr-status ${needsChecking(job) ? "amber" : job.status === "live" ? "green" : "grey"}`}><i></i>{(needsChecking(job) ? "Needs attention" : jobStatusLabels[job.status]).toUpperCase()}</span><button type="button" className="rr-mini-menu" aria-label="Open job records" onClick={() => router.push(`/jobs/${job.id}/records`)}>•••</button></div>
            <button type="button" className="rr-job-title" onClick={() => router.push(`/jobs/${job.id}/overview`)}>{job.title}</button><p>{known(job.siteLabel) || known(job.customerLabel) || "Details needed"}</p>
            <div className="rr-mini-footer"><strong>{job.document.reference ?? "No quote yet"}</strong><div><small>Payment</small><span>{job.customerPayment === "not_due" ? "Not due" : job.customerPayment === "settled" ? "Paid" : job.customerPayment === "part_paid" ? "Part paid" : job.customerPayment === "due" ? "Due" : "Not checked"}</span></div></div></div>
        </article>)}</div>
      </section>
    </section>
  </Shell>;
}

// ---------- To check ----------
export function DesignedCheck() {
  return <Screen title="The things that need you." active="check">{workspace => <Check workspace={workspace}/>}</Screen>;
}
function Check({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const [counts, setCounts] = useState(workspace.decisions?.counts ?? null);
  return <Shell workspace={{ ...workspace, pending: counts?.pending ?? workspace.pending }} title="The things that need you." subtitle={INNER_SUBTITLE} active="check">
    <Head kicker="THE JOBGUARD WATCHDOG" title="Only what needs attention." text="Every item says what we noticed, why it matters and what to do. No AI makes approvals, sends claims or spends money in this practice." action={counts && <Tag tone={counts.pending ? "amber" : "green"}>{counts.pending ? `${counts.pending} to decide` : "All clear"}</Tag>}/>
    <div data-testid="designed-check"><Legacy label="Decision inbox" cards><DecisionInbox tenantId={workspace.tenantId} close={() => router.push("/today")} onCounts={setCounts}/></Legacy></div>
  </Shell>;
}

// ---------- Money ----------
export function DesignedMoney() {
  return <Screen title="Know where every pound stands." active="money">{workspace => <MoneyHome workspace={workspace}/>}</Screen>;
}
function MoneyHome({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const { jobs, failed } = useJobs(workspace.tenantId);
  const values = useValues(jobs);
  const outstanding = total(values, value => value.outstandingGross.pence), invoiced = total(values, value => value.invoicedGross.pence);
  const paid = total(values, value => value.recordedGross.pence), approved = total(values, value => value.approvedExtras.pence);
  const show = (pence: number | null | undefined) => pence === undefined ? "…" : money(pence);
  return <Shell workspace={workspace} title="Know where every pound stands." subtitle={INNER_SUBTITLE} active="money">
    <Head kicker="YOUR MONEY" title="Know where the money stands." text="Approved work, invoices and recorded payments have different meanings. JobGuard keeps them distinct."/>
    <div className="metric-grid" data-testid="designed-money">
      <div className="metric"><span>Approved extras</span><strong>{show(approved)}</strong><small>Not automatically invoiced</small></div>
      <div className="metric"><span>Invoiced, still outstanding</span><strong>{show(outstanding)}</strong><small>No bank verification</small></div>
      <div className="metric"><span>Payments recorded by hand</span><strong>{show(paid)}</strong><small>Of {show(invoiced)} invoiced</small></div>
    </div>
    <div className="two-col">
      <div><Card title="Jobs and next actions">
        {failed ? <Empty title="Your jobs did not load" text="Nothing changed. Refresh the page to try again."/> : !jobs ? <Empty title="Loading…" text="This takes a moment."/> : !jobs.length ? <Empty title="No jobs yet" text="Start a new job to see its money here."/>
          : jobs.map((job, index) => { const value = values?.[job.id]; return <div className="job-row" key={job.id}>
            <img className="job-photo" src={PHOTOS[index % PHOTOS.length]} alt="Illustrative property"/>
            <div className="job-name"><strong>{job.title}</strong><small>{money(value?.invoicedGross.pence)} invoiced · {money(value?.recordedGross.pence)} recorded as paid</small><p>{documentLine(job)}</p>{statusTag(job.status)}</div>
            <div className="job-side"><strong>{value ? money(value.outstandingGross.pence) : "…"}</strong><button type="button" className="btn small primary" onClick={() => router.push(`/jobs/${job.id}/money`)}>Open money →</button></div>
          </div>; })}
      </Card></div>
      <div><Card title="What should I trust?"><div className="card-body">
        <Note><strong>These are separate stages.</strong> Approved work is not necessarily invoiced, and neither an invoice nor a manually entered receipt proves that money has cleared.</Note>
        <div className="divider"></div>
        <div className="ledger-step"><div><strong>Extra approved</strong><span>Customer agreed</span></div><small>Not yet billed</small></div>
        <div className="ledger-step"><div><strong>Invoice issued</strong><span>Recorded</span></div><small>Not proof of payment</small></div>
        <div className="ledger-step"><div><strong>Payment recorded</strong><span>Entered by hand</span></div><small>Not bank verified</small></div>
        <div className="divider"></div>
        <div className="head-buttons"><a className="btn small" href="/value">Business value →</a><a className="btn small" href="/plans">Plans and fees →</a></div>
      </div></Card></div>
    </div>
  </Shell>;
}

// ---------- More ----------
export function DesignedMore() {
  return <Screen title="Built to protect your profit." active="more">{workspace => <More workspace={workspace}/>}</Screen>;
}
const BENEFITS: [string, string, string][] = [
  ["01", "Never miss work at the quote", "Type or paste the job, confirm the list and price it from your own numbers."],
  ["02", "Know what the job is worth", "Keep the agreed quote, approved extras and invoices in one place."],
  ["03", "Catch supplier mistakes", "Compare ordered, delivered and invoiced quantities and prices before paying."],
  ["04", "Stop wasted site days", "See what is missing before the day starts: materials, access and earlier work."],
  ["05", "Keep proof before it disappears", "Know which photo or note is needed before a stage is covered up."],
  ["06", "Keep every extra", "Record, price and get approval for changes rather than hoping someone remembers."],
  ["07", "Follow the bill to payment", "Keep approval, invoice and recorded payments separate, right to the end."],
];
const TOOLS = { proof: "Add a photo", extra: "Add extra work", final: "Prepare the final bill", fee: "See the fee example" } as const;
const LINKS: [string, string][] = [["/demo-s", "Small-builder practice chooser"], ["/practice-company", "Practice company"], ["/practice-bank", "Practice bank"], ["/value", "Business value"], ["/plans", "Plans"], ["/meter", "Jobs on the go"], ["/things-to-check-report", "Things-to-check report"], ["/admin/contractor", "Contractor organisation practice"], ["/contractor/work-orders", "Contractor work orders"], ["/contractor/dashboard", "Contractor dashboard"], ["/", "The original home screen and guided tour"]];

function More({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const { jobs } = useJobs(workspace.tenantId);
  const [tool, setTool] = useState<keyof typeof TOOLS | null>(null);
  const close = () => setTool(null);
  return <Shell workspace={workspace} title="Built to protect your profit." subtitle={INNER_SUBTITLE} active="more">
    <Head kicker="WHY JOBGUARD EXISTS" title="One job. Seven ways profit escapes." text="JobGuard is the profit watchdog — not seven separate apps. It follows the same job and tells you what matters."/>
    <div className="benefit-layout" data-testid="designed-more">{BENEFITS.map(([n, title, text]) => <article className="benefit" key={n}><span>{n} / PROFIT PROTECTION</span><h3>{title}</h3><p>{text}</p><button type="button" className="btn small" onClick={() => router.push("/jobs")}>Find this in a job →</button></article>)}</div>
    <div style={{ marginTop: 20 }}><Card title="Practice tools" sub="Quick ways in for a job already under way. Everything here is practice only.">
      <div className="card-body"><div className="head-buttons">{(Object.keys(TOOLS) as (keyof typeof TOOLS)[]).map(key => <button key={key} type="button" className={`btn small ${tool === key ? "primary" : ""}`} aria-pressed={tool === key} onClick={() => setTool(key)}>{TOOLS[key]}</button>)}</div></div>
      {tool === "fee" && <div className="card-body" style={{ paddingTop: 0 }}><Note>The fee example needs a job whose quote has been accepted and started. If nothing appears below, no practice job has reached that step yet.</Note></div>}
    </Card></div>
    {tool && <div style={{ marginTop: 18 }}><Legacy label={TOOLS[tool]} cards>{tool === "proof" ? <ProofCapture close={close}/> : tool === "extra" ? <VariationFlow close={close}/> : tool === "final" ? <FinalAccount close={close}/> : <FeeStatement jobId={jobs?.[0]?.id ?? ""}/>}</Legacy></div>}
    <div style={{ marginTop: 20 }}><Card title="Other practice views"><div className="work-list">{LINKS.map(([href, label]) => <div className="work-item" key={href}><div className="work-text"><strong>{label}</strong></div><a className="btn small" href={href}>Open →</a></div>)}</div>
      <div className="card-body"><Note>This is a practice workspace with made-up records. Nothing here sends a real message, takes a payment or creates a JobGuard fee.</Note></div>
    </Card></div>
  </Shell>;
}

