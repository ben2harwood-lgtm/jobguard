"use client";
import { useEffect, useState } from "react";
import { meterTodayReadV1, meterTodayLabels, type MeterTodayRead, meterTodayJobsReadV1, type MeterTodayJobsRead } from "@jobguard/core";

async function loadMeterResponse(fetcher: typeof fetch, endpoint: string) {
  const sessionResponse = await fetcher("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!sessionResponse.ok) {
    // Finish the fetch before hiding the optional meter on a refused read.
    await sessionResponse.text();
    throw new Error(sessionResponse.status < 500 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  }
  const session = await sessionResponse.json() as { csrfToken?: string; memberships?: { tenantId: string }[] };
  const tenantId = session.memberships?.[0]?.tenantId;
  if (!session.csrfToken || !tenantId) throw new Error("SIGN_IN_REQUIRED");
  const response = await fetcher(endpoint, { cache: "no-store", credentials: "same-origin",
    headers: { "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId } });
  if (!response.ok) {
    await response.text();
    throw new Error(response.status === 401 || response.status === 403 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  }
  return response.json() as Promise<unknown>;
}
export async function loadMeter(fetcher: typeof fetch = fetch): Promise<MeterTodayRead> {
  return meterTodayReadV1.parse(await loadMeterResponse(fetcher, "/api/meter/current"));
}
export async function loadMeterJobs(fetcher: typeof fetch = fetch): Promise<MeterTodayJobsRead> {
  return meterTodayJobsReadV1.parse(await loadMeterResponse(fetcher, "/api/meter/current/jobs"));
}
export function MeterJobs({ view }: { view: MeterTodayJobsRead }) {
  return <section aria-label="Jobs behind today's count"><h2>Jobs behind today's count</h2>
    <ul>{view.places.map(place => <li data-testid="meter-job-row" key={place.jobIds.join(":")}>
      {place.jobIds.map(id => <p key={id}>Job reference: {id}</p>)}
      <p>{place.kind === "free_small_place" && place.jobIds.length > 1 ? "Shares a free small place (same customer and site)" : place.kind === "free_small_place" ? "Free small place" : place.kind === "shared_place" ? "Shares a place (same customer and site)" : "Counts as a place"}</p>
    </li>)}</ul>
  </section>;
}
export function JobsOnTheGoLine() {
  const [view, setView] = useState<MeterTodayRead | null>(null);
  useEffect(() => {
    let active = true;
    void loadMeter().then(value => { if (active) setView(value); }).catch(() => { if (active) setView(null); });
    return () => { active = false; };
  }, []);
  if (!view) return null;
  const labels = meterTodayLabels(view);
  return <p><a data-testid="jobs-on-the-go-line" href="/meter">{labels.count}</a> · {labels.next}</p>;
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
export function MeterScreen() {
  const [view, setView] = useState<MeterTodayRead | null>(null);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<MeterTodayJobsRead | null>(null);
  const [jobsUnavailable, setJobsUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    void loadMeter().then(value => { if (active) setView(value); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error && reason.message === "SIGN_IN_REQUIRED" ? "sign-in" : "unavailable");
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void loadMeterJobs().then(value => { if (active) setJobs(value); }).catch(() => { if (active) setJobsUnavailable(true); });
    return () => { active = false; };
  }, []);
  const consistentJobs = jobs && view && jobs.meter.date === view.date && jobs.meter.plan === view.plan &&
    jobs.meter.countedPlaces === view.countedPlaces && jobs.meter.freeSmallPlaces === view.freeSmallPlaces;
  return <main className="workspace-page"><h1>Jobs on the go</h1>
    <p>Synthetic demonstration. Figures and prices are hypothetical. No real payments are taken.</p>
    {error ? <p role="alert">{error === "sign-in" ? <a href="/sign-in">Sign in to your company to see its meter.</a>
      : "Today's meter is unavailable. Reload to try again."}</p>
      : view ? <MeterDetails view={view} /> : <p role="status">Loading today's meter…</p>}
    {view && (consistentJobs ? <MeterJobs view={jobs} /> : jobsUnavailable || jobs ?
      <p role="status">Today's job list is unavailable. Reload to try again.</p> : <p role="status">Loading today's job list…</p>)}
    <p><a href="/plans">Plans and subscription</a></p>
  </main>;
}
