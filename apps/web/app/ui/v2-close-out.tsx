"use client";
import React, { useEffect, useState } from "react";
import type { V2CloseOutReview } from "@jobguard/core";

const control = { minHeight: 44, display: "inline-flex", alignItems: "center" } as const;

/** The card only: items come from the server, each with its own wording and link. */
export function V2CloseOutCard({ review }: { review: V2CloseOutReview }) {
  return <section aria-labelledby="close-out-heading" style={{ overflowWrap: "anywhere" }}>
    <h2 id="close-out-heading">Before you close this job</h2>
    {review.items.length === 0
      ? <p role="status">Nothing open. You can complete the final account.</p>
      : <ul style={{ paddingLeft: 20 }}>{review.items.map(item => <li key={item.kind}>
        <p>{item.blocking ? <strong>Must fix: </strong> : <span>Check: </span>}{item.label}.</p>
        <a style={control} href={item.href}>{item.blocking ? "Fix this" : "Look at this"}</a>
      </li>)}</ul>}
    {review.items.some(item => !item.blocking) && <p>These are reminders. You can still complete the final account.</p>}
  </section>;
}

/** V2-G6: read-only. Completing the account, the lock, Final Check and invoices stay where they are today. */
export function V2CloseOut({ jobId }: { jobId: string }) {
  const [review, setReview] = useState<V2CloseOutReview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/close-out`, { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json() as { review: V2CloseOutReview | null };
        if (active) { setReview(data.review); setError(false); }
      } catch { if (active) setError(true); }
    };
    void load();
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [jobId]);
  if (error) return <p role="alert">Close-out review unavailable. Try again.</p>;
  return review ? <V2CloseOutCard review={review}/> : null;
}
