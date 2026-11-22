"use client";

import { FINAL_ACCOUNT_DECLARATION, FINAL_ACCOUNT_DECLARATION_VERSION } from "@jobguard/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { pounds } from "../lib/pounds";
import { FinalCheckReveal } from "../ui/final-check-reveal";
import { Card } from "./designed-ui";

const viewSchema = z.object({
  jobId: z.guid(),
  termsApproved: z.boolean(),
  lock: z.object({ id: z.guid(), lockedAt: z.string() }).nullable(),
  account: z.object({
    id: z.guid(), revision: z.number().int().positive(), issueBlocked: z.boolean(),
    totals: z.object({ total: z.object({ pence: z.number().int() }) }),
    lines: z.array(z.object({ sourceId: z.guid(), scopeItemId: z.guid(), description: z.string(),
      kind: z.enum(["baseline", "variation"]), netPence: z.number().int() })),
  }).nullable(),
  captures: z.array(z.object({ id: z.guid(), description: z.string(), state: z.string() })),
  dispositions: z.array(z.object({ scopeItemId: z.guid(), disposition: z.enum(["done", "removed", "deferred"]) })),
});

async function responseJson(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.code ?? "UNAVAILABLE");
  return body;
}

export function PilotFinalAccount({ jobId, pilotFetch }: { jobId: string; pilotFetch: typeof fetch }) {
  const [view, setView] = useState<z.infer<typeof viewSchema>>();
  const [error, setError] = useState("");
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const base = `/api/jobs/${encodeURIComponent(jobId)}`;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const current = viewSchema.parse(await responseJson(await pilotFetch(`${base}/final-account`, { signal: signal ?? null })));
    if (current.jobId !== jobId) throw new Error("WRONG_JOB");
    if (!signal?.aborted) setView(current);
  }, [base, jobId, pilotFetch]);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted) setError("Could not load the saved final account.");
    });
    return () => controller.abort();
  }, [refresh]);

  async function send(path: string, body: Record<string, unknown>) {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError("");
    try {
      await responseJson(await pilotFetch(`${base}/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, commandId: crypto.randomUUID() }),
      }));
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setError(code === "TERMS_PENDING" ? "Final Check terms are not yet approved."
        : "Could not save this action. Review the saved account before trying again.");
    } finally {
      try { await refresh(); }
      catch { setError("Could not reload the saved final account."); }
      writing.current = false;
      setBusy(false);
    }
  }

  const account = view?.account;
  const dispositions = new Map(view?.dispositions.map(item => [item.scopeItemId, item.disposition]));
  const baseline = [...new Set(account?.lines.filter(line => line.kind === "baseline").map(line => line.scopeItemId))];
  const canLock = view?.termsApproved && !view.lock && account && !account.issueBlocked && baseline.length > 0 &&
    baseline.every(id => dispositions.has(id));
  return <>
    <Card title="Final account">
      {error && <p role="alert">{error}</p>}
      {!view && !error && <p role="status">Loading the saved final account…</p>}
      {view && !view.termsApproved && !view.lock && <p role="status">Final Check terms are not yet approved.</p>}
      {view?.lock && <p>Final account locked.</p>}
      {view && !view.lock && <button type="button" disabled={busy} onClick={() => void send("final-account", {
        version: "final-account.assemble.v1", expectedRevision: account?.revision ?? 0,
      })}>{account ? "Refresh final account" : "Prepare final account"}</button>}
      {account && <>
        <ul>{account.lines.map(line => <li key={line.sourceId}>{line.description} · {pounds(line.netPence)}
          {line.kind === "variation" && " · Approved extra"}
        </li>)}</ul>
        <p>Total including VAT {pounds(account.totals.total.pence)}</p>
        {account.issueBlocked && <p>Complete the required job proof before locking.</p>}
      </>}
      {view?.captures.map(extra => <p key={extra.id}>{extra.description} · {extra.state}</p>)}
      {view && !view.lock && <form onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        const description = new FormData(form).get("description");
        void send("final-account/review-extras", { version: "pilot-final-review-extra.v1", description });
      }}>
        <label>Extra work to add<textarea name="description" required maxLength={500}/></label>
        <button type="submit" disabled={busy}>Log extra</button>
      </form>}
      {!view?.lock && baseline.map(scopeItemId => <label key={scopeItemId}>
        {account?.lines.find(line => line.scopeItemId === scopeItemId)?.description}
        <select value={dispositions.get(scopeItemId) ?? ""} disabled={busy} onChange={event => void send("final-account/dispositions", {
          version: "final-account.disposition.v1", scopeItemId, disposition: event.target.value,
        })}>
          <option value="" disabled>Review this work</option>
          <option value="done">Done</option><option value="removed">Removed</option><option value="deferred">Deferred</option>
        </select>
      </label>)}
      {canLock && <>
        <label><input type="checkbox" checked={declared} onChange={event => setDeclared(event.target.checked)}/>
          {FINAL_ACCOUNT_DECLARATION}
        </label>
        <button type="button" disabled={busy || !declared} onClick={() => void send("final-account/lock", {
          version: "final-account.lock.v1", finalAccountRevisionId: account.id, expectedRevision: account.revision,
          declarationVersion: FINAL_ACCOUNT_DECLARATION_VERSION,
        })}>Complete final account</button>
      </>}
    </Card>
    {view?.lock && <FinalCheckReveal jobId={jobId} pilotFetch={pilotFetch}/>}
    <p>Invoices are not yet available in the pilot until the invoice rules are approved.</p>
  </>;
}
