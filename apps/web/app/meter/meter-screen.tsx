"use client";
import { useEffect, useState } from "react";
import { meterTodayReadV1, meterTodayLabels, type MeterTodayRead, meterTodayJobsReadV1, type MeterTodayJobsRead } from "@jobguard/core";

import { CompanyWorkspace, companySession, selectCompany, companyHeaders, type SelectedCompany } from "./company-selection";

async function loadMeterResponse(fetcher: typeof fetch, endpoint: string, company: SelectedCompany) {
  const response = await fetcher(endpoint, { cache: "no-store", credentials: "same-origin", headers: companyHeaders(company) });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw new Error(response.status === 401 || response.status === 403 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  }
  return response.json() as Promise<unknown>;
}
async function resolveCompany(fetcher: typeof fetch, tenant?: string) {
  const company = selectCompany(await companySession(fetcher), tenant);
  if (!company) throw new Error("COMPANY_SELECTION_REQUIRED");
  return company;
}
export async function loadMeter(fetcher: typeof fetch = fetch, tenant?: string): Promise<MeterTodayRead> {
  return meterTodayReadV1.parse(await loadMeterResponse(fetcher, "/api/meter/current", await resolveCompany(fetcher, tenant)));
}
export async function loadMeterJobs(fetcher: typeof fetch = fetch, tenant?: string): Promise<MeterTodayJobsRead> {
  return meterTodayJobsReadV1.parse(await loadMeterResponse(fetcher, "/api/meter/current/jobs", await resolveCompany(fetcher, tenant)));
}
export async function loadCompanyMeter(company: SelectedCompany, fetcher: typeof fetch = fetch) {
  const [view, jobs] = await Promise.all([
    loadMeterResponse(fetcher, "/api/meter/current", company).then(value => meterTodayReadV1.parse(value)),
    loadMeterResponse(fetcher, "/api/meter/current/jobs", company).then(value => meterTodayJobsReadV1.parse(value)),
  ]);
  return { tenantId: company.tenantId, view, jobs };
}
export function MeterJobs({ view }: { view: MeterTodayJobsRead }) {
  return <section aria-label="Jobs behind today's count"><h2>Jobs behind today's count</h2>
    <ul>{view.places.map(place => <li data-testid="meter-job-row" key={place.jobIds.join(":")}>
      {place.jobIds.map(id => <p key={id}>Job reference: {id}</p>)}
      <p>{place.kind === "free_small_place" && place.jobIds.length > 1 ? "Shares a free small place (same customer and site)" : place.kind === "free_small_place" ? "Free small place" : place.kind === "shared_place" ? "Shares a place (same customer and site)" : "Counts as a place"}</p>
    </li>)}</ul>
  </section>;
}
export function JobsOnTheGoLine({ hasCompanySession = false }: { hasCompanySession?: boolean }) {
  return hasCompanySession ? <OptionalCompanyMeterLine /> : null;
}
function OptionalCompanyMeterLine() {
  const [loaded, setLoaded] = useState<{ company: SelectedCompany; view: MeterTodayRead } | null>(null);
  useEffect(() => {
    let active = true, latest = 0;
    const refresh = () => {
      const request = ++latest; setLoaded(null);
      void resolveCompany(fetch).then(async company => ({ company,
        view: meterTodayReadV1.parse(await loadMeterResponse(fetch, "/api/meter/current", company)),
      })).then(value => { if (active && request === latest) setLoaded(value); }).catch(() => {
        if (active && request === latest) setLoaded(null);
      });
    };
    refresh(); window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  if (!loaded) return null;
  const labels = meterTodayLabels(loaded.view);
  return <p>{loaded.company.name}: <a data-testid="jobs-on-the-go-line" href={`/meter?tenant=${encodeURIComponent(loaded.company.tenantId)}`}>{labels.count}</a> · {labels.next}</p>;
}
export function MeterDetails({ view }: { view: MeterTodayRead }) {
  const labels = meterTodayLabels(view);
  return <section aria-label="Today's jobs on the go">
    <p>Today in London: {view.date}</p><p data-testid="jobs-on-the-go">{labels.count}</p>
    <p>{labels.capacity}</p><p>{labels.grace} {labels.graceUse}</p>
    <p data-testid="next-job-price">{labels.next}</p>
    {view.trackReviewDecisionId && <p data-testid="track-review-due" role="status">track_review_due: this company has passed Builder's grace place, so an account review is due. Nothing is blocked, the monthly maximum still holds and no track changes on its own. Saved decision {view.trackReviewDecisionId}.</p>}
    <p>{view.freeSmallPlaces} small {view.freeSmallPlaces === 1 ? "place does" : "places do"} not take a plan place today.</p>
  </section>;
}
export function MeterScreen({ tenant }: { tenant?: string | string[] | undefined }) {
  return <main className="workspace-page"><h1>Jobs on the go</h1>
    <p>Synthetic demonstration. Figures and prices are hypothetical. No real payments are taken.</p>
    <CompanyWorkspace key={JSON.stringify(tenant) ?? "default"} initialTenant={tenant}>{company => <CompanyMeter company={company} />}</CompanyWorkspace>
    <p><a href="/plans">Plans and subscription</a></p>
  </main>;
}
function CompanyMeter({ company }: { company: SelectedCompany }) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadCompanyMeter>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void loadCompanyMeter(company).then(value => { if (active) setLoaded(value); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error && reason.message === "SIGN_IN_REQUIRED" ? "sign-in" : "unavailable");
    });
    return () => { active = false; };
  }, [company.tenantId, company.csrfToken]);
  const view = loaded?.tenantId === company.tenantId ? loaded.view : null;
  const jobs = loaded?.tenantId === company.tenantId ? loaded.jobs : null;
  const consistentJobs = jobs && view && jobs.meter.date === view.date && jobs.meter.plan === view.plan &&
    jobs.meter.countedPlaces === view.countedPlaces && jobs.meter.freeSmallPlaces === view.freeSmallPlaces;
  return <>
    {error ? <p role="alert">{error === "sign-in" ? <a href="/sign-in">Sign in to your company to see its meter.</a>
      : "Today's meter is unavailable. Reload to try again."}</p>
      : view ? <MeterDetails view={view} /> : <p role="status">Loading today's meter…</p>}
    {view && (consistentJobs ? <MeterJobs view={jobs} /> : <p role="status">Today's job list is unavailable. Reload to try again.</p>)}
  </>;
}
