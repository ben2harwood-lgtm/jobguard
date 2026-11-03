"use client";
import { useState } from "react";
import { routeSubscriptionOnboarding } from "@jobguard/core";

type Answers = { usualJobs: string; siteStaffCapture: string };

export function OnboardingSuggestion({ usualJobs, siteStaffCapture }: Answers) {
  try {
    if (!/^\d+$/u.test(usualJobs) || !["yes", "no"].includes(siteStaffCapture)) throw new Error("Invalid answers");
    const result = routeSubscriptionOnboarding({ version: "subscription-onboarding-input.v1",
      usualJobs: Number(usualJobs), siteStaffCapture: siteStaffCapture === "yes" });
    return <div role="status"><p>Suggestion: {result.recommendedTrack === "small_builder"
      ? "Solo or Builder should fit." : "The contractor deal may fit better."}</p>
      {result.recommendedTrack === "contractor" && <p><a href="/admin/contractor">Contractor organisation practice</a></p>}
      <p>This suggestion changes no plan or access. Contractor capabilities require a contractor agreement.</p>
    </div>;
  } catch {
    return <p role="alert">Enter a whole number of jobs, zero or more, and answer the site staff question.</p>;
  }
}

/** Local suggestion only: no company identifiers, persistence or command callbacks. */
export function SubscriptionOnboarding() {
  const [answers, setAnswers] = useState<Answers | null>(null);
  return <section aria-label="Plan suggestion"><h2>Which deal might fit?</h2>
    <form noValidate onChange={() => setAnswers(null)} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setAnswers({ usualJobs: String(data.get("usualJobs") ?? "").trim(), siteStaffCapture: String(data.get("siteStaffCapture") ?? "") });
    }}>
      <label>How many jobs do you usually have on the go? <input name="usualJobs" inputMode="numeric" /></label>
      <label>Do your site staff need to capture work themselves? <select name="siteStaffCapture" defaultValue="">
        <option value="">Choose an answer</option><option value="no">No</option><option value="yes">Yes</option>
      </select></label>
      <button type="submit">Show suggestion</button>
    </form>
    {answers && <OnboardingSuggestion {...answers} />}
  </section>;
}
