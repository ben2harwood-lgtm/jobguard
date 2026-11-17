"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { jobWorkspaceResponseV1 } from "@jobguard/api/workspace-contracts";
import { watchdogActive, watchdogUnavailableCopy } from "@jobguard/core";

const WatchdogStatus = createContext<string | null>(null);

/** A shared authoritative read also notices changes made in another client. */
export function WatchdogStatusProvider({ jobId, initialStatus, children }: { jobId: string; initialStatus: string; children: ReactNode }) {
  const [status, setStatus] = useState<string | null>(initialStatus);
  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);
  useEffect(() => {
    const controller = new AbortController(); let reading = false;
    const load = async () => {
      if (reading) return; reading = true;
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Job status unavailable");
        const snapshot = jobWorkspaceResponseV1.parse(await response.json());
        if (!controller.signal.aborted) setStatus(snapshot.job.status);
      } catch { if (!controller.signal.aborted) setStatus(null); }
      finally { reading = false; }
    };
    void load(); const timer = setInterval(() => void load(), 1500);
    return () => { controller.abort(); clearInterval(timer); };
  }, [jobId]);
  return <WatchdogStatus.Provider value={status}>{children}</WatchdogStatus.Provider>;
}

export function useWatchdogActive(): boolean { return watchdogActive({ status: useContext(WatchdogStatus) ?? "unknown" }); }

/** Disables writes while retaining every existing read and source panel. */
export function WatchdogPanel({ children, status: suppliedStatus, disableControls = true }: { children: ReactNode; status?: string; disableControls?: boolean }) {
  const contextStatus = useContext(WatchdogStatus);
  const status = suppliedStatus ?? contextStatus;
  const job = { status: status ?? "unknown" };
  return <div data-testid="watchdog-panel" data-watchdog-active={watchdogActive(job)}>
    <fieldset disabled={disableControls && !watchdogActive(job)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {children}
    </fieldset>
    {status === null ? <p role="status">Loading job status…</p> : watchdogUnavailableCopy(job) && <p role="status">{watchdogUnavailableCopy(job)}</p>}
  </div>;
}
