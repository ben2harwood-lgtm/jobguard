"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { finalAccountResponseV1, type FinalAccountResponse } from "@jobguard/api/final-account-contracts";
import { CustomerInvoices } from "../ui/customer-invoices";
import { finalAccountLockViewV1, lockBoundInvoiceProps } from "../ui/final-account-lock";
import { FINAL_CHECK_CHANGED_EVENT } from "../ui/final-check-reveal-view";
import { Card, onJobRefresh, readJson } from "./designed-ui";

type SavedAccount = {
  account: FinalAccountResponse["account"];
  lock: ReturnType<typeof finalAccountLockViewV1.parse> | null;
};

export function JobInvoices({ jobId }: { jobId: string }) {
  const [saved, setSaved] = useState<SavedAccount | null>(null);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const path = `/api/jobs/${encodeURIComponent(jobId)}/final-account`;
    try {
      const final = finalAccountResponseV1.parse(await readJson(path, signal));
      if (final.jobId !== jobId) throw new Error("WRONG_JOB_RESPONSE");
      const lock = final.account ? finalAccountLockViewV1.parse(await readJson(`${path}/lock`, signal)) : null;
      if (lock && lock.jobId !== jobId) throw new Error("WRONG_JOB_RESPONSE");
      if (!signal.aborted) {
        setSaved({ account: final.account, lock });
        setError(false);
      }
    } catch {
      if (!signal.aborted) setError(true);
    }
  }, [jobId]);
  useEffect(() => {
    const refresh = () => void load();
    const checkChanged = (event: Event) => {
      if ((event as CustomEvent<{ jobId?: string }>).detail?.jobId === jobId) refresh();
    };
    const stop = onJobRefresh([jobId], refresh);
    window.addEventListener(FINAL_CHECK_CHANGED_EVENT, checkChanged);
    refresh();
    return () => {
      request.current?.abort();
      stop();
      window.removeEventListener(FINAL_CHECK_CHANGED_EVENT, checkChanged);
    };
  }, [jobId, load]);
  // The final check finishes in the background, and this tab does not mount the reveal that announces it.
  // While the saved guard says the check is still running, read again every 5 s, for up to 3 minutes.
  const pending = saved?.lock?.invoiceGuard === "FINAL_CHECK_NOT_COMPLETE";
  useEffect(() => {
    if (!pending) return;
    let reads = 0;
    const timer = window.setInterval(() => {
      reads += 1;
      if (reads > 36) { window.clearInterval(timer); return; }
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pending, load]);
  useEffect(() => {
    const root = panel.current;
    if (!root) return;
    if (location.hash === "#customer-invoices") root.closest("#customer-invoices")?.scrollIntoView({ block: "start" });
    let focusedFragment = "";
    const focusInvoice = () => {
      const fragment = location.hash;
      if (fragment === focusedFragment || !/^#invoice-[a-f0-9-]{36}$/iu.test(fragment)) return;
      const invoice = document.getElementById(fragment.slice(1));
      if (!invoice || !root.contains(invoice)) return;
      focusedFragment = fragment;
      if (invoice.contains(document.activeElement)) return;
      invoice.focus({ preventScroll: true });
      invoice.scrollIntoView({ block: "start" });
    };
    const observer = new MutationObserver(focusInvoice);
    observer.observe(root, { childList: true, subtree: true });
    const onHash = () => { focusedFragment = ""; focusInvoice(); };
    window.addEventListener("hashchange", onHash);
    focusInvoice();
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  const account = saved?.account;
  return <Card title="Invoices and payments" id="customer-invoices" className="designed-money-card">
    <div className="card-body" ref={panel}>
      {error ? <><p role="alert">The final account could not load. Check the saved account before issuing an invoice.</p><button className="btn" onClick={() => void load()}>Try final account again</button></>
        : !saved ? <p role="status">Loading the saved final account…</p>
        : !account || !saved.lock ? <p><a href={`/jobs/${jobId}/work#final-account-title`}>Build the final account in Work</a> to prepare an invoice.</p>
        : <>
          <CustomerInvoices jobId={jobId} finalAccount={account} designed/>
          <CustomerInvoices jobId={jobId} {...lockBoundInvoiceProps(saved.lock, account)} designed/>
        </>}
    </div>
  </Card>;
}
