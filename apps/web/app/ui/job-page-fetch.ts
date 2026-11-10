export const JOB_SAVED_EVENT = "job-saved";

/** Successful saves in this page invalidate its site-work snapshot. This event
 * stays in this window, so another tab still has to resolve a stale revision.
 * Reads, refusals and unknown outcomes never publish a successful save.
 */
export const jobPageFetch: typeof fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);
  const job = typeof input === "string" ? /^\/api\/jobs\/([^/?#]+)(?:[/?#]|$)/u.exec(input) : null;
  const method = (init?.method ?? "GET").toUpperCase();
  if (response.ok && job && !["GET", "HEAD", "OPTIONS"].includes(method) && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    // Best effort: a refresh signal must never turn a saved response into a failure.
    try { window.dispatchEvent(new CustomEvent(JOB_SAVED_EVENT, { detail: { jobId: job[1] } })); } catch { /* the save already succeeded */ }
  }
  return response;
};
