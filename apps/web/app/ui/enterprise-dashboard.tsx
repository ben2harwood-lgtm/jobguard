"use client";
import { useState, type FormEvent } from "react";
import { BASELINE_METHOD_V1, dashboardDimensions, type dashboardQueryV1 } from "@jobguard/core";
import type { z } from "zod";
import type { EnterpriseDashboardApplication, EnterpriseBaselineApplication } from "@jobguard/api/workspace";
import { exactPounds } from "./contractor-billing";
import styles from "./work-orders.module.css";

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
export function DashboardView({ activity, billing }: { activity: Activity; billing: Billing }) {
  const { report, signals } = activity;
  return <>
    <h2>Captured and approved extras</h2>
    <p>Activity and billing are separate server reads. Reload to refresh both. Group pages show a subset; each total below has its complete source drill-down.</p>
    {Object.entries(report.totals).filter(([, value]) => value !== null).map(([stage, total]) => total && <details key={stage}>
      <summary>{stageLabels[stage]}: {total.count}{(stage === "captured" || stage === "approved") && <> · known net {pounds(total.known.pence)} · unknown values {total.unknownCount}</>}</summary>
      <ul>{report.contributions.filter(c => c.stage === stage).map((c, i) => <li key={i}>Job {c.jobId} · extras {c.extraIds.join(", ") || "none"} · {c.value ? pounds(c.value.pence) : "Value unknown / not applicable"} · sources {c.sourceIds.join(", ")}</li>)}</ul>
    </details>)}
    <p>Close-out yes / answered: {report.closeoutRate.status === "computed" ? `${report.closeoutRate.numerator}/${report.closeoutRate.denominator}` : "Not computable"}.</p>
    <h3>Activity groups ({report.groupCount} total)</h3>
    {report.groups.map(g => <details key={g.id ?? "unattributed"}><summary>{g.id ?? "Unattributed"}</summary><ul>{Object.entries(g.totals).map(([stage, total]) => <li key={stage}>{stageLabels[stage]}: {total.count}{(stage === "captured" || stage === "approved") && <> · known net {pounds(total.known.pence)} · unknown values {total.unknownCount}</>}</li>)}</ul><ul>{g.contributions.map((c, i) => <li key={i}>{stageLabels[c.stage]} · job {c.jobId} · extras {c.extraIds.join(", ") || "none"} · sources {c.sourceIds.join(", ")}</li>)}</ul></details>)}
    <h2>Billed and paid</h2>
    <p>Latest imported balances for the capture cohort, including credits and reversals. These are observations, not fee entitlement.</p>
    {!billing.complete && <p role="alert">Incomplete allocation runs: {billing.held.map(h => `${h.extraId} (run ${h.runId})`).join(", ")}. Figures are partial.</p>}
    {(["billed", "paid"] as const).map(stage => <details key={stage}><summary>{stage}: {billing.totals[stage].count} extras · net {exactPounds(billing.totals[stage].exactPence)}</summary>
      <ul>{billing.contributions.filter(c => c.stage === stage).map((c, i) => <li key={i}>Job {c.jobId} · extra {c.extraId} · {exactPounds(c.exactPence)} · export line {c.exportLineId} · revision {c.revisionId} · fact {c.factId} · run {c.runId} · allocations {c.allocationIds.join(", ") || "none"} · input hash {c.inputHash}</li>)}</ul>
    </details>)}
    <h3>Billing groups ({billing.groupCount} total)</h3>
    {billing.groups.map(g => <details key={g.id ?? "unattributed"}><summary>{g.id ?? "Unattributed"} · billed {exactPounds(g.totals.billed.exactPence)} · paid {exactPounds(g.totals.paid.exactPence)}</summary>
      <ul>{billing.contributions.filter(c => c.group === g.id).map((c, i) => <li key={i}>{c.stage} · job {c.jobId} · extra {c.extraId} · {exactPounds(c.exactPence)}</li>)}</ul></details>)}
    <h2>Advisory signals</h2><p>Advisory only. These observations never change prices, counts, states, fees or statements.</p>
    <p>Unmatched “other” invoice lines may be variations; review the cited invoice fact and allocation run. They do not prove a variation or fee entitlement. Unattributed invoice lines are excluded from operative views and filters. “No” close-out outliers: {signals.outliers.status}. {signals.outliers.status === "supplied_synthetic_policy" ? signals.outliers.policy?.text : "No answered visits in the selected population."}</p>
    {signals.observations.length ? <ul>{signals.observations.map(s => <li key={s.id}>{signalLabels[s.kind]} · job {s.jobId} · extras {s.extraIds.join(", ") || "none"} · sources {s.sourceIds.join(", ")}</li>)}</ul> : <p>No observations from the available sources.</p>}
    <details><summary>Methods and reproducibility</summary>{[report, billing, signals].map(r => <section key={r.method.version}><p>{r.method.version}: {r.method.text}</p><p>Input {r.inputHash} · output {r.outputHash}</p></section>)}</details>
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
export function EnterpriseDashboard() {
  const [activity, setActivity] = useState<Activity | null>(null), [billing, setBilling] = useState<Billing | null>(null), [baseline, setBaseline] = useState<Baseline | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [batchId, setBatchId] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    // Clear previously authorized data even if the next request fails after a membership change.
    setActivity(null); setBilling(null); setBaseline(null);
    try { await work(); } catch (e) { setMessage(`Request refused (${e instanceof Error ? e.message : "DASHBOARD_UNAVAILABLE"}). Reload after checking your company session and scope.`); }
    finally { setBusy(false); }
  }
  function load(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    void run(async () => {
      const query = { version: "enterprise-dashboard-query.v1", from: `${data.get("from")}T00:00:00Z`, until: `${data.get("until")}T00:00:00Z`, dimension: data.get("dimension"),
        filters: data.get("filterId") ? { [String(data.get("filterDimension"))]: data.get("filterId") } : {}, offset: Number(data.get("offset")), limit: 20 } as Query;
      const [a, b] = await Promise.all([post<Activity>("dashboard", { version: "enterprise-dashboard-request.v1", resource: "activity", query }), post<Billing>("dashboard", { version: "enterprise-dashboard-request.v1", resource: "billing", query })]);
      setActivity(a); setBilling(b);
    });
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
      <label>Synthetic baseline-history.v1 (6–12 months) <textarea name="content" rows={6} required maxLength={8000000}/></label>
      <label>Historical team = current company team ID (one binding per line) <textarea name="bindings" rows={3} required/></label><button>Import history</button>
    </form></fieldset>
    <fieldset disabled={busy}><legend>Compare pilot teams with the rest</legend><form onSubmit={compare}>
      <label>Stored batch ID <input value={batchId} onChange={e => setBatchId(e.target.value)} required/></label>
      <label>Pilot historical team IDs (comma separated) <input name="pilot" required/></label><label>Rest historical team IDs (comma separated) <input name="rest" required/></label>
      <label htmlFor="baseline-output-format">Export format</label> <select id="baseline-output-format" name="outputFormat"><option value="json">JSON</option><option value="csv">CSV</option></select><button>Compare baseline</button>
    </form></fieldset>
    {busy && <p role="status">Loading…</p>}{message && <p role="status">{message}</p>}
    {activity && billing && <DashboardView activity={activity} billing={billing}/>}{baseline && <BaselineView baseline={baseline}/>}
  </main>;
}
