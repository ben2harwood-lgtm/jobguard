"use client";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { JOB_SAVED_EVENT } from "../ui/job-page-fetch";
import { Card } from "./designed-ui";

const exactQuote = z.object({
  documentId: z.guid(), documentVersion: z.number().int(), documentHash: z.string(),
  reference: z.string(), totalPence: z.number().int(),
});
const jobView = z.object({
  environment: z.literal("pilot_no_charge"), version: z.literal(1), jobId: z.guid(),
  title: z.string(), status: z.string(), jobRevision: z.number().int(), offered: exactQuote.nullable(),
  acceptance: exactQuote.extend({ acceptedAt: z.iso.datetime(), method: z.enum(["fixture", "customer_authenticated"]) }).nullable(),
  baselineDocumentId: z.guid().nullable(),
});
const progressView = z.object({ jobId: z.guid(), scope: z.array(z.object({
  scopeItemId: z.guid(), description: z.string(), stage: z.enum(["not_started", "in_progress", "complete"]), revision: z.number().int(),
})) });
const extrasView = z.object({ jobId: z.guid(), variations: z.array(z.object({
  id: z.guid(), description: z.string(), state: z.string(),
})) });
const proofView = z.object({ jobId: z.guid(), evidence: z.array(z.object({ id: z.guid(), scopeItemId: z.guid() })) });
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

async function readJson(response: Response) {
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.code ?? "UNAVAILABLE");
  return response.json();
}

function errorText(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTHENTICATED") return "Sign in again to continue.";
  if (code === "REVISION_CONFLICT" || code === "STALE_ACCEPTANCE" || code === "COMMAND_CONFLICT") return "This job changed. Review its latest details and try again.";
  if (code === "OBJECT_INVALID" || code === "PROOF_INVALID") return "The photo could not be verified. Choose another photo and try again.";
  return "This action could not be completed. Try again.";
}

export function PilotJobContinuation({ jobId, pilotFetch, canWrite, onLive }: {
  jobId: string; pilotFetch: typeof fetch; canWrite: boolean; onLive: (live: boolean) => void;
}) {
  const [job, setJob] = useState<z.infer<typeof jobView>>();
  const [live, setLive] = useState<{
    scope: z.infer<typeof progressView>["scope"]; variations: z.infer<typeof extrasView>["variations"];
    evidence: z.infer<typeof proofView>["evidence"];
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/jobs/${encodeURIComponent(jobId)}`;
  const post = (path: string, body: unknown) => pilotFetch(`${base}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then(readJson);
  async function refresh(signal: AbortSignal | null = null) {
    const view = jobView.parse(await readJson(await pilotFetch(`${base}/quotes/acceptance`, { signal })));
    if (view.jobId !== jobId) throw new Error("WRONG_JOB");
    if (signal?.aborted) return;
    setJob(view);
    onLive(Boolean(view.baselineDocumentId));
    if (!view.baselineDocumentId) return;
    const [progress, extras, proof] = await Promise.all([
      pilotFetch(`${base}/work-state`, { signal }).then(readJson).then(data => progressView.parse(data)),
      pilotFetch(`${base}/variations`, { signal }).then(readJson).then(data => extrasView.parse(data)),
      pilotFetch(`${base}/proof`, { signal }).then(readJson).then(data => proofView.parse(data)),
    ]);
    if ([progress, extras, proof].some(view => view.jobId !== jobId)) throw new Error("WRONG_JOB");
    if (!signal?.aborted) setLive({ scope: progress.scope, variations: extras.variations, evidence: proof.evidence });
  }

  useEffect(() => {
    let pending: AbortController | undefined;
    const reload = () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      void refresh(controller.signal).catch(error => {
        if (!controller.signal.aborted) setError(errorText(error));
      });
    };
    reload();
    const saved = (event: Event) => {
      if ((event as CustomEvent<{ jobId: string }>).detail.jobId === jobId) reload();
    };
    window.addEventListener(JOB_SAVED_EVENT, saved);
    return () => {
      pending?.abort();
      window.removeEventListener(JOB_SAVED_EVENT, saved);
    };
  }, [jobId, pilotFetch]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setError(errorText(error));
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  function quoteCommand(document: z.infer<typeof exactQuote>) {
    return { commandId: crypto.randomUUID(), documentId: document.documentId, documentHash: document.documentHash,
      documentVersion: document.documentVersion, expectedJobRevision: job!.jobRevision };
  }

  async function upload(event: FormEvent<HTMLFormElement>, scopeItemId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const photo = new FormData(form).get("photo");
    if (!(photo instanceof File) || !photo.size || photo.size > 5_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(photo.type)) {
      setError("Choose a JPEG, PNG or WebP photo up to 5 MB.");
      return;
    }
    await run(async () => {
      const digest = await crypto.subtle.digest("SHA-256", await photo.arrayBuffer());
      const expectedSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const upload = z.object({ uploadId: z.guid(), uploadUrl: z.url() }).parse(await post("proof", {
        version: "pilot-proof.v1", action: "begin", commandId: crypto.randomUUID(), scopeItemId,
        expectedSha256, contentType: photo.type, byteLength: photo.size,
      }));
      const stored = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": photo.type }, body: photo });
      const objectVersionId = stored.headers.get("x-amz-version-id");
      if (!stored.ok || !objectVersionId) throw new Error("OBJECT_INVALID");
      await post("proof", { version: "pilot-proof.v1", action: "finalize", commandId: crypto.randomUUID(),
        uploadId: upload.uploadId, objectVersionId });
      form.reset();
    });
  }

  async function log(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const description = new FormData(form).get("description");
    await run(async () => {
      await post("variations", { version: "pilot-log-extra.v1", commandId: crypto.randomUUID(),
        description });
      form.reset();
    });
  }

  if (!job?.offered && !job?.acceptance && !error) return null;
  const quote = job?.acceptance ?? job?.offered;
  return <>
    {job?.baselineDocumentId && <h2>{job.title}</h2>}
    <Card title="Quote acceptance">
      {error && <p role="alert">{error}</p>}
      {quote && <dl>
        <dt>Quote</dt><dd>{quote.reference}, version {quote.documentVersion}</dd>
        <dt>Total</dt><dd>{gbp.format(quote.totalPence / 100)}</dd>
        <dt>Document hash</dt><dd><code style={{ overflowWrap: "anywhere" }}>{quote.documentHash}</code></dd>
      </dl>}
      {job?.acceptance && <p>{job.acceptance.method === "fixture" ? "Acceptance recorded from a customer fixture." : "Accepted by the authenticated customer."}{" "}
        <time dateTime={job.acceptance.acceptedAt}>{new Date(job.acceptance.acceptedAt).toLocaleString("en-GB")}</time></p>}
      {canWrite && job?.offered && job.status === "quoting" && <button disabled={busy} onClick={() => void run(() =>
        post("quotes/acceptance", { version: "pilot-acceptance-fixture.v1", ...quoteCommand(job.offered!), acceptedAt: new Date().toISOString() }))}>
        Record fixture acceptance
      </button>}
      {canWrite && job?.acceptance && job.status === "accepted" && <button disabled={busy} onClick={() => void run(() =>
        post("quotes/activation", { version: "pilot-switch-live.v1", ...quoteCommand(job.acceptance!) }))}>
        Switch this job live
      </button>}
      {job?.baselineDocumentId && <p>Job live on the accepted quote. No JobGuard charge.</p>}
    </Card>
    {job?.baselineDocumentId && <Card title="On-site progress">
      {!live ? <p role="status">Loading site work…</p> : live.scope.map(item => {
        const evidence = live.evidence.filter(photo => photo.scopeItemId === item.scopeItemId);
        return <section key={item.scopeItemId}>
          <h3>{item.description}</h3>
          <p>{item.stage === "complete" ? "Complete" : item.stage === "in_progress" ? "In progress" : "Not started"}</p>
          {evidence.map((photo, index) => <button type="button" key={photo.id} disabled={busy} onClick={() => void run(async () => {
            const result = z.object({ downloadUrl: z.url() }).parse(await pilotFetch(`${base}/proof?evidenceId=${photo.id}`).then(readJson));
            location.assign(result.downloadUrl);
          })}>Open verified photo {index + 1}</button>)}
          {canWrite && item.stage === "in_progress" && <form onSubmit={event => void upload(event, item.scopeItemId)}>
            <label>Completion photo<input name="photo" type="file" accept="image/png,image/jpeg,image/webp" required /></label>
            <button type="submit" disabled={busy}>Attach photo</button>
          </form>}
          {canWrite && item.stage !== "complete" && <button disabled={busy || (item.stage === "in_progress" && !evidence.length)}
            onClick={() => void run(() => post("work-state", {
              version: "pilot-scope-progress.v1", scopeItemId: item.scopeItemId, expectedRevision: item.revision,
              ...(item.stage === "not_started" ? { action: "start" } : { action: "complete", commandId: crypto.randomUUID(), evidenceId: evidence.at(-1)?.id }),
            }))}>{item.stage === "not_started" ? "Start work" : "Mark complete"}</button>}
        </section>;
      })}
    </Card>}
    {job?.baselineDocumentId && <Card title="Extras">
      {live?.variations.map(extra => <p key={extra.id}>{extra.description} · {extra.state}</p>)}
      {canWrite && <form onSubmit={event => void log(event)}>
        <label>Extra work<textarea name="description" required maxLength={500} /></label>
        <button type="submit" disabled={busy}>Log extra</button>
      </form>}
    </Card>}
  </>;
}
