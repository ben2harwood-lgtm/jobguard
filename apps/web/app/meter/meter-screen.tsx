"use client";
import { useEffect, useState } from "react";
import { meterTodayReadV1, meterTodayLabels, type MeterTodayRead } from "@jobguard/core";

export async function loadMeter(fetcher: typeof fetch = fetch): Promise<MeterTodayRead> {
  const sessionResponse = await fetcher("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!sessionResponse.ok) throw new Error(sessionResponse.status < 500 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  const session = await sessionResponse.json() as { csrfToken?: string; memberships?: { tenantId: string }[] };
  const tenantId = session.memberships?.[0]?.tenantId;
  if (!session.csrfToken || !tenantId) throw new Error("SIGN_IN_REQUIRED");
  const response = await fetcher("/api/meter/current", { cache: "no-store", credentials: "same-origin",
    headers: { "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId } });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  return meterTodayReadV1.parse(await response.json());
}
export function MeterDetails({ view }: { view: MeterTodayRead }) {
  const labels = meterTodayLabels(view);
  return <section aria-label="Today's jobs on the go">
    <p>Today in London: {view.date}</p><p data-testid="jobs-on-the-go">{labels.count}</p>
    <p>{labels.capacity}</p><p>{labels.grace} {labels.graceUse}</p>
    <p data-testid="next-job-price">{labels.next}</p>
    <p>{view.freeSmallPlaces} small {view.freeSmallPlaces === 1 ? "place does" : "places do"} not take a plan place today.</p>
  </section>;
}
export function MeterScreen() {
  const [view, setView] = useState<MeterTodayRead | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void loadMeter().then(value => { if (active) setView(value); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error && reason.message === "SIGN_IN_REQUIRED" ? "sign-in" : "unavailable");
    });
    return () => { active = false; };
  }, []);
  return <main className="workspace-page"><h1>Jobs on the go</h1>
    <p>Synthetic demonstration. Figures and prices are hypothetical. No real payments are taken.</p>
    {error ? <p role="alert">{error === "sign-in" ? <a href="/sign-in">Sign in to your company to see its meter.</a>
      : "Today's meter is unavailable. Reload to try again."}</p>
      : view ? <MeterDetails view={view} /> : <p role="status">Loading today's meter…</p>}
    <p><a href="/plans">Plans and subscription</a></p>
  </main>;
}
