"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BASELINE_METHOD_V1, dashboardDimensions, type dashboardQueryV1 } from "@jobguard/core";
import { z } from "zod";
import type { EnterpriseDashboardApplication, EnterpriseBaselineApplication } from "@jobguard/api/workspace";
import { exactPounds } from "./contractor-billing";
import styles from "./work-orders.module.css";
import northsideSample from "../../../../docs/fixtures/contractor-full-demo-package.v1.json";

type Activity = Awaited<ReturnType<EnterpriseDashboardApplication["read"]>>;
type Billing = Awaited<ReturnType<EnterpriseDashboardApplication["readBilling"]>>;
type Baseline = Awaited<ReturnType<EnterpriseBaselineApplication["read"]>>;
type Query = z.infer<typeof dashboardQueryV1>;
const pounds = (pence: number) => exactPounds({ numerator: String(pence), denominator: "1" });
const fraction = (v: { numerator: string; denominator: string } | null) => v ? `${v.numerator}/${v.denominator}` : "Not computable";
const stageLabels: Record<string, string> = { captured: "Captured", approved: "Approved", backlog: "Pending approval steps", overdue: "Overdue steps", onTime: "Approvals on time", late: "Late approvals", closeoutYes: "Yes close-outs", closeoutNo: "No close-outs", closeoutMissing: "Missing close-out answers" };
const signalLabels = { billed_variation_without_extra: "Possible billed variation without a JobGuard extra", order_matches_unlinked_extra: "Order line matches an unlinked extra",
  withdrawn_then_quantity_increased: "Already-on-order withdrawal followed by a quantity increase", no_closeout_observation: '“No” close-out outlier' };
function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: filename.endsWith("csv") ? "text/csv" : "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/contractor/${path}`, { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.code ?? "DASHBOARD_UNAVAILABLE");
  return value as T;
}
/** One figure's drill-down: a total (no group) or one group's figure. */
type Figure = { resource: "activity" | "billing"; stage: string; group?: string | null };
type Drill = { key: string; offset: number; total: number; rows: unknown[] };
const drillPage = 200;
const figureKey = (f: Figure) => `${f.resource}|${f.stage}|${f.group === undefined ? "*" : f.group ?? "~"}`;
/** A figure's sources: its first page from the report, or the page last requested for it, with its own page controls. */
function Sources<T>({ figure, first, total, drill, onPage, render }: { figure: Figure; first: T[]; total: number; drill?: Drill | null | undefined;
  onPage?: ((figure: Figure, offset: number) => void) | undefined; render: (row: T, index: number) => ReactNode }) {
  const own = drill?.key === figureKey(figure) ? drill : null, rows = own ? own.rows as T[] : first, offset = own?.offset ?? 0;
  return <>{rows.length > 0 && <ul>{rows.map(render)}</ul>}
    {total > rows.length && <p>Sources {offset + 1}–{offset + rows.length} of {total}{onPage && <>{" "}
      <button type="button" disabled={offset === 0} onClick={() => onPage(figure, Math.max(0, offset - drillPage))}>Previous sources</button>{" "}
      <button type="button" disabled={offset + rows.length >= total} onClick={() => onPage(figure, offset + rows.length)}>Next sources</button></>}</p>}</>;
}
export function DashboardView({ activity, billing, drill, onPage }: { activity: Activity; billing: Billing; drill?: Drill | null; onPage?: (figure: Figure, offset: number) => void }) {
  const { report } = activity, signals = "observations" in activity.signals ? activity.signals : null;
  const partial = !report.contributionPage.complete || report.groups.some(g => !g.contributionPage.complete) || !billing.contributionPage.complete;
  return <>
    <h2>Captured and approved extras</h2>
    <p>Activity and billing are separate server reads. Reload to refresh both. Group pages show a subset; each total below has its complete source drill-down.</p>
    {partial && <p role="status">Long lists show their first {report.contributionPage.limit} sources per total ({report.groups[0]?.contributionPage.limit ?? 20} per group figure); use Next sources to see the rest. Every total still counts all of its sources.</p>}
    {Object.entries(report.totals).filter(([, value]) => value !== null).map(([stage, total]) => total && <details key={stage}>
      <summary>{stageLabels[stage]}: {total.count}{(stage === "captured" || stage === "approved") && <> · known net {pounds(total.known.pence)} · unknown values {total.unknownCount}</>}</summary>
      <Sources figure={{ resource: "activity", stage }} first={report.contributions.filter(c => c.stage === stage)} total={total.count} drill={drill} onPage={onPage}
        render={(c: Activity["report"]["contributions"][number], i) => <li key={i}>Job {c.jobId} · extras {c.extraIds.join(", ") || "none"} · {c.value ? pounds(c.value.pence) : "Value unknown / not applicable"} · sources {c.sourceIds.join(", ")}</li>}/>
    </details>)}
    <p>Close-out yes / answered: {report.closeoutRate.status === "computed" ? `${report.closeoutRate.numerator}/${report.closeoutRate.denominator}` : "Not computable"}.</p>
    <h3>Activity groups ({report.groupCount} total)</h3>
    {report.groups.map(g => <details key={g.id ?? "unattributed"}><summary>{g.id ?? "Unattributed"}</summary><ul>{Object.entries(g.totals).map(([stage, total]) => <li key={stage}>{stageLabels[stage]}: {total.count}{(stage === "captured" || stage === "approved") && <> · known net {pounds(total.known.pence)} · unknown values {total.unknownCount}</>}
      <Sources figure={{ resource: "activity", stage, group: g.id }} first={g.contributions.filter(c => c.stage === stage)} total={total.count} drill={drill} onPage={onPage}
        render={(c: Activity["report"]["contributions"][number], i) => <li key={i}>{stageLabels[c.stage]} · job {c.jobId} · extras {c.extraIds.join(", ") || "none"} · sources {c.sourceIds.join(", ")}</li>}/></li>)}</ul></details>)}
    <h2>Billed and paid</h2>
    <p>Latest imported balances for the capture cohort, including credits and reversals. These are observations, not fee entitlement.</p>
    {!billing.complete && <p role="alert">Incomplete allocation runs: {billing.held.map(h => `${h.extraId} (run ${h.runId})`).join(", ")}. Figures are partial.</p>}
    {(["billed", "paid"] as const).map(stage => <details key={stage}><summary>{stage}: {billing.totals[stage].count} extras · net {exactPounds(billing.totals[stage].exactPence)}</summary>
      <Sources figure={{ resource: "billing", stage }} first={billing.contributions.filter(c => c.stage === stage)} total={billing.totals[stage].count} drill={drill} onPage={onPage}
        render={(c: Billing["contributions"][number], i) => <li key={i}>Job {c.jobId} · extra {c.extraId} · {exactPounds(c.exactPence)} · export line {c.exportLineId} · revision {c.revisionId} · fact {c.factId} · run {c.runId} · allocations {c.allocationIds.join(", ") || "none"} · input hash {c.inputHash}</li>}/>
    </details>)}
    <h3>Billing groups ({billing.groupCount} total)</h3>
    {billing.groups.map(g => <details key={g.id ?? "unattributed"}><summary>{g.id ?? "Unattributed"} · billed {exactPounds(g.totals.billed.exactPence)} · paid {exactPounds(g.totals.paid.exactPence)}</summary>
      {(["billed", "paid"] as const).filter(stage => g.totals[stage].count > 0).map(stage => <Sources key={stage} figure={{ resource: "billing", stage, group: g.id }}
        first={g.contributions.filter(c => c.stage === stage)} total={g.totals[stage].count} drill={drill} onPage={onPage}
        render={(c: Billing["contributions"][number], i) => <li key={i}>{c.stage} · job {c.jobId} · extra {c.extraId} · {exactPounds(c.exactPence)}</li>}/>)}</details>)}
    {signals ? <><h2>Advisory signals</h2><p>Advisory only. These observations never change prices, counts, states, fees or statements.</p>
    <p>Unmatched “other” invoice lines may be variations; review the cited invoice fact and allocation run. They do not prove a variation or fee entitlement. Unattributed invoice lines are excluded from operative views and filters. “No” close-out outliers: {signals.outliers.status}. {signals.outliers.status === "supplied_synthetic_policy" ? signals.outliers.policy?.text : "No answered visits in the selected population."}</p>
    {signals.observations.length ? <ul>{signals.observations.map(s => <li key={s.id}>{signalLabels[s.kind]} · job {s.jobId} · extras {s.extraIds.join(", ") || "none"} · sources {s.sourceIds.join(", ")}</li>)}</ul> : <p>No observations from the available sources.</p>}</> : <p role="status">Advisory signals were not computed: this selection has more than {"bound" in activity.signals ? activity.signals.bound : 0} source rows. Narrow the period or filter.</p>}
    <details><summary>Methods and reproducibility</summary>{[report, billing, ...(signals ? [signals] : [])].map(r => <section key={r.method.version}><p>{r.method.version}: {r.method.text}</p><p>Input {r.inputHash} · output {r.outputHash}</p></section>)}</details>
    <button type="button" onClick={() => download(JSON.stringify({ activity, billing }), "contractor-dashboard.json")}>Export reports and methods (JSON)</button>
  </>;
}
export function BaselineView({ baseline }: { baseline: Baseline }) {
  const r = baseline.report;
  return <section><h2>Pilot baseline comparison</h2><p>Descriptive synthetic history; no causal claim or fee calculation.</p>
    {(["pilot", "rest"] as const).map(name => { const cohort = r[name]; return <details key={name} open><summary>{name}: {cohort.totals.jobs} jobs · {cohort.totals.extras} extras · known net {pounds(cohort.totals.knownNet.pence)} · unknown values {cohort.totals.unknownValues}</summary>
      <p>Extras per 100 jobs: {fraction(cohort.extrasPer100Jobs.exact)} ({cohort.extrasPer100Jobs.status}). Known value per job: {fraction(cohort.valuePerJob.knownExact)} pence ({cohort.valuePerJob.status}).</p>
      <ul>{cohort.jobs.map(j => <li key={j.sourceJobId}>Job {j.sourceJobId} · team {j.teamId} · {j.month} · known net {pounds(j.knownNet.pence)} · unknown values {j.unknownValues}<ul>{j.extras.map(e => <li key={e.sourceExtraId}>Extra {e.sourceExtraId} · work {e.sourceWorkId} · {e.reportedNet ? pounds(e.reportedNet.pence) : "Unknown value"}</li>)}</ul></li>)}</ul>
    </details>; })}
    <p>{r.method.version}: {r.method.text}</p><p>Input {r.inputHash} · source {r.sourceHash} · output {r.outputHash}</p>
    <button type="button" onClick={() => download(baseline.content, `pilot-baseline.${baseline.format}`)}>Download baseline with method ({baseline.format})</button>
  </section>;
}
const practiceTeamsV1 = z.object({ seeded: z.literal(true), journey: z.object({
  practiceTeams: z.array(z.object({ id: z.guid(), name: z.string() })).min(2),
}) });
type PracticeTeam = z.infer<typeof practiceTeamsV1>["journey"]["practiceTeams"][number];

export function practiceTeamBindings(teams: readonly PracticeTeam[]) {
  const [pilot, rest] = teams;
  return pilot && rest ? `fictional-pilot=${pilot.id}\nfictional-rest=${rest.id}` : "";
}

export function EnterpriseDashboard() {
  const [baselineContent, setBaselineContent] = useState("");
  const [bindings, setBindings] = useState(""), [practiceTeams, setPracticeTeams] = useState<PracticeTeam[]>([]);
  const [pilot, rest] = practiceTeams;
  useEffect(() => {
    void fetch("/api/northside", { cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const result = practiceTeamsV1.safeParse(await response.json());
      if (result.success) setPracticeTeams(result.data.journey.practiceTeams);
    }).catch(() => {});
  }, []);
  const [activity, setActivity] = useState<Activity | null>(null), [billing, setBilling] = useState<Billing | null>(null), [baseline, setBaseline] = useState<Baseline | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [batchId, setBatchId] = useState("");
  const [lastQuery, setLastQuery] = useState<Query | null>(null), [drill, setDrill] = useState<Drill | null>(null);
  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    // Clear previously authorized data even if the next request fails after a membership change.
    setActivity(null); setBilling(null); setBaseline(null); setDrill(null);
    try { await work(); } catch (e) { setMessage(`Request refused (${e instanceof Error ? e.message : "DASHBOARD_UNAVAILABLE"}). Reload after checking your company session and scope.`); }
    finally { setBusy(false); }
  }
  function load(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    void run(async () => {
      const query = { version: "enterprise-dashboard-query.v1", from: `${data.get("from")}T00:00:00Z`, until: `${data.get("until")}T00:00:00Z`, dimension: data.get("dimension"),
        filters: data.get("filterId") ? { [String(data.get("filterDimension"))]: data.get("filterId") } : {}, offset: Number(data.get("offset")), limit: 20 } as Query;
      const [a, b] = await Promise.all([post<Activity>("dashboard", { version: "enterprise-dashboard-request.v1", resource: "activity", query }), post<Billing>("dashboard", { version: "enterprise-dashboard-request.v1", resource: "billing", query })]);
      setActivity(a); setBilling(b); setLastQuery(query);
    });
  }
  /** Pages one figure through its own drill-down; every request rechecks the session and scope on the server. */
  function pageFigure(figure: Figure, offset: number) {
    if (!lastQuery) return;
    const query = { ...lastQuery, drilldown: { stage: figure.stage, ...(figure.group === undefined ? {} : { group: figure.group }), offset, limit: drillPage } } as Query;
    setBusy(true); setMessage("");
    void post<Activity | Billing>("dashboard", { version: "enterprise-dashboard-request.v1", resource: figure.resource, query }).then(result => {
      const page = figure.resource === "activity" ? (result as Activity).report.drilldown : (result as Billing).drilldown;
      setDrill(page ? { key: figureKey(figure), offset, total: page.total, rows: page.contributions } : null);
    }).catch((e: unknown) => {
      // As for a full reload, a refused page clears every previously authorized figure.
      setActivity(null); setBilling(null); setDrill(null);
      setMessage(`Request refused (${e instanceof Error ? e.message : "DASHBOARD_UNAVAILABLE"}). Reload after checking your company session and scope.`);
    }).finally(() => setBusy(false));
  }
  function importHistory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    void run(async () => {
      const teamBindings = String(data.get("bindings")).trim().split("\n").map(line => { const [sourceTeamId, teamId, ...extra] = line.trim().split(/\s*=\s*/u); if (!sourceTeamId || !teamId || extra.length) throw new Error("BASELINE_INVALID"); return { sourceTeamId, teamId }; });
      const result = await post<{ batchId: string; replayed: boolean }>("baseline", { version: "baseline-store.v1", format: data.get("format"), content: data.get("content"), teamBindings });
      setBatchId(result.batchId); setMessage(`${result.replayed ? "Existing import replayed" : "History imported"}: ${result.batchId}. No live jobs or money records changed.`);
    });
  }
  function compare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    void run(async () => { setBaseline(await post<Baseline>("baseline/compare", { version: "baseline-read.v1", batchId,
      cohorts: { version: "baseline-cohorts.v1", pilotTeamIds: String(data.get("pilot")).split(",").map(s => s.trim()), restTeamIds: String(data.get("rest")).split(",").map(s => s.trim()) },
      methodVersion: BASELINE_METHOD_V1.version, outputFormat: data.get("outputFormat") })); });
  }
  return <main className={styles.main}><h1>Contractor dashboard</h1><p>Synthetic practice only. Company session and current dashboard scope apply.</p>
    <a href="/admin/contractor">Company administration</a> · <a href="/contractor/work-orders">Work orders</a>
    <fieldset disabled={busy}><legend>Dashboard selection</legend><form onSubmit={load}>
      <label>Captured from (UTC) <input name="from" type="date" required/></label><label>Until, exclusive (UTC) <input name="until" type="date" required/></label>
      <label>Group by <select name="dimension">{dashboardDimensions.map(d => <option key={d}>{d}</option>)}</select></label>
      <label>Filter dimension <select name="filterDimension">{dashboardDimensions.filter(d => d !== "period").map(d => <option key={d}>{d}</option>)}</select></label><label>Filter ID (optional) <input name="filterId"/></label>
      <label>Group offset <input name="offset" type="number" min="0" max="100000" defaultValue="0" required/></label><button>Load dashboard</button>
    </form></fieldset>
    <fieldset disabled={busy}><legend>Import historical baseline (finance only)</legend><form onSubmit={importHistory}>
      <label>Format <select name="format"><option value="json">JSON</option><option value="csv">CSV</option></select></label>
      <label>Synthetic baseline-history.v1 (6–12 months) <textarea name="content" rows={6} required maxLength={8000000} value={baselineContent} onChange={e => setBaselineContent(e.target.value)}/></label>
      <button type="button" onClick={() => setBaselineContent(JSON.stringify(northsideSample.history, null, 2))}>Load fictional Northside baseline sample</button>
      {pilot && rest && <><button type="button" onClick={() => setBindings(practiceTeamBindings(practiceTeams))}>Use two practice teams</button>
        <p>Practice teams: fictional-pilot = {pilot.name}; fictional-rest = {rest.name}</p></>}
      <p>Reference example only. Bind fictional-pilot and fictional-rest to two different company teams below.</p>
      <label>Historical team = current company team ID (one binding per line) <textarea name="bindings" rows={3} required value={bindings} onChange={e => setBindings(e.target.value)}/></label><button>Import history</button>
    </form></fieldset>
    <fieldset disabled={busy}><legend>Compare pilot teams with the rest</legend><form onSubmit={compare}>
      <label>Stored batch ID <input value={batchId} onChange={e => setBatchId(e.target.value)} required/></label>
      <label>Pilot historical team IDs (comma separated) <input name="pilot" required/></label><label>Rest historical team IDs (comma separated) <input name="rest" required/></label>
      <label htmlFor="baseline-output-format">Export format</label> <select id="baseline-output-format" name="outputFormat"><option value="json">JSON</option><option value="csv">CSV</option></select><button>Compare baseline</button>
    </form></fieldset>
    {busy && <p role="status">Loading…</p>}{message && <p role="status">{message}</p>}
    {activity && billing && <DashboardView activity={activity} billing={billing} drill={drill} onPage={pageFigure}/>}{baseline && <BaselineView baseline={baseline}/>}
  </main>;
}
