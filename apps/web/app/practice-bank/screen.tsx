"use client";
import { useEffect, useRef, useState } from "react";
type View = { credentialsUnavailable?: boolean; version: "ais-practice-view.v1"; connection: { connectionId: string; status: string } | null;
  movements: { movementRef: string; status: "pending" | "settled" | "reversed"; pence: number; currency: "GBP"; bookedOn: string }[] };
const statuses: Record<string, string> = { awaiting_consent: "Waiting for practice consent", linked: "Fictional account linked for practice",
  revoked: "Practice consent revoked. Connect again for fresh consent.", unlinked: "Fictional account unlinked. Connect again for fresh consent.",
  expired: "Practice consent expired. Connect again for fresh consent.", token_revoked: "Practice credentials lost or revoked. Connect again for fresh consent." };
type Company = { tenantId: string; name?: string };
type Session = { csrfToken: string; memberships: Company[] };
const unavailable = "Practice bank unavailable. Sign in and refresh to try again.";
const accessChanged = "Company access changed. Choose an authorised company or sign in again.";
class CompanyAccessError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
async function loadSession(): Promise<Session> {
  const auth = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!auth.ok) throw new CompanyAccessError(accessChanged);
  const session = await auth.json().catch(() => null) as Partial<Session> | null;
  if (!session || typeof session.csrfToken !== "string" || !session.csrfToken || !Array.isArray(session.memberships) ||
    !session.memberships.length || session.memberships.some(m => !m || typeof m.tenantId !== "string" || !uuid.test(m.tenantId) ||
      (m.name !== undefined && typeof m.name !== "string")) ||
    new Set(session.memberships.map(m => m.tenantId.toLowerCase())).size !== session.memberships.length) throw new CompanyAccessError(accessChanged);
  return session as Session;
}
async function request(session: Session, tenantId: string, operation?: string, connectionId?: string): Promise<View> {
  const response = await fetch("/api/practice-bank", { cache: "no-store", credentials: "same-origin", method: operation ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId },
    ...(operation ? { body: JSON.stringify({ version: "ais-practice-command.v1", operation, ...(connectionId ? { connectionId } : {}) }) } : {}),
  });
  if (!response.ok) {
    const error = await response.json() as { code?: string };
    // Render only local text, never an unexpected server/provider exception.
    throw new Error(error.code === "AIS_INACTIVE" ? "Consent is inactive or expired. Connect again for fresh practice consent."
      : error.code === "AIS_TOKEN_REVOKED" ? statuses.token_revoked
      : error.code === "AIS_CALLBACK_INVALID" ? "Practice consent is missing, changed or already used. Connect again."
      : unavailable);
  }
  return response.json() as Promise<View>;
}
export function PracticeBankScreen() {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]), [tenantId, setTenantId] = useState("");
  // Changes and unmounts invalidate all old reads, commands and recovery reads.
  const generation = useRef(0), busyRef = useRef(false), selected = useRef("");
  function clear() { setView(null); setError(""); setBusy(false); busyRef.current = false; }
  function loseCompany() { selected.current = ""; setTenantId(""); setView(null); }
  async function update(operation?: string, tenant = tenantId, epoch = generation.current) {
    if (!tenant || selected.current !== tenant || busyRef.current) return;
    const current = () => generation.current === epoch && selected.current === tenant;
    busyRef.current = true; setBusy(true); setError("");
    const connectionId = operation === "start" ? undefined : view?.connection?.connectionId;
    async function readOrCommand(action?: string) {
      const session = await loadSession();
      if (!current()) return null;
      setCompanies(session.memberships);
      if (session.memberships.filter(m => m.tenantId === tenant).length !== 1) throw new CompanyAccessError(accessChanged);
      return request(session, tenant, action, action ? connectionId : undefined);
    }
    try {
      const next = await readOrCommand(operation);
      if (current()) setView(next);
    } catch (reason) {
      if (!current()) return;
      setView(null);
      if (reason instanceof CompanyAccessError) { loseCompany(); setError(accessChanged); }
      else {
        // Only request() errors contain fixed local text. Never show a fetch exception.
        setError(reason instanceof Error && [unavailable, statuses.token_revoked,
          "Consent is inactive or expired. Connect again for fresh practice consent.",
          "Practice consent is missing, changed or already used. Connect again."].includes(reason.message) ? reason.message : unavailable);
        if (operation) {
          // A failed pull may have recorded token loss. Reload only this company's durable status.
          try { const next = await readOrCommand(); if (current()) setView(next); }
          catch (recoveryError) {
            if (current() && recoveryError instanceof CompanyAccessError) { loseCompany(); setError(accessChanged); }
          }
        }
      }
    } finally { if (generation.current === epoch) { busyRef.current = false; setBusy(false); } }
  }
  function switchCompany(tenant: string) {
    generation.current++; selected.current = tenant; setTenantId(tenant); clear();
    if (!uuid.test(tenant) || companies.filter(m => m.tenantId === tenant).length !== 1) {
      loseCompany(); setError(accessChanged); return;
    }
    void update(undefined, tenant);
  }
  useEffect(() => {
    const epoch = generation.current;
    void loadSession().then(session => {
      if (generation.current !== epoch) return;
      setCompanies(session.memberships);
      const requested = new URLSearchParams(window.location.search).getAll("tenantId");
      const tenant = requested.length ? requested.length === 1 ? requested[0]! : "" :
        session.memberships.length === 1 ? session.memberships[0]!.tenantId : "";
      if (requested.length && (!uuid.test(tenant) || !session.memberships.some(m => m.tenantId === tenant))) {
        setError(accessChanged); return;
      }
      if (tenant) { selected.current = tenant; setTenantId(tenant); void update(undefined, tenant, epoch); }
    }).catch(() => { if (generation.current === epoch) { loseCompany(); setError(accessChanged); } });
    return () => { generation.current++; };
  }, []);
  return <main className="workspace-page" style={{ overflowWrap: "anywhere" }}>
    <h1>Practice bank</h1>
    <p>Fictional account only. No real bank is connected.</p>
    <p>A bank line does not mark a case landed and does not start a fee.</p>
    {companies.length > 0 && <label>Company <select aria-label="Company" value={tenantId} onChange={e => switchCompany(e.target.value)}>
      <option value="">Choose a company</option>
      {companies.map(company => <option key={company.tenantId} value={company.tenantId}>{company.name ?? company.tenantId}</option>)}
    </select></label>}
    {tenantId && <p>Practice bank for {companies.find(company => company.tenantId === tenantId)?.name ?? tenantId}</p>}
    {error ? <p role="alert">{error}</p> : null}
    {busy ? <p role="status">Updating practice bank…</p> : null}
    <button disabled={busy || !tenantId} onClick={() => void update()}>Refresh practice bank</button>
    {view ? <>
      <p role="status">{view.credentialsUnavailable ? statuses.token_revoked : view.connection ? statuses[view.connection.status] ?? "Practice account unavailable" : "No fictional account linked"}</p>
      <button disabled={busy} onClick={() => void update("start")}>{view.connection ? "Reconnect fictional account" : "Connect fictional account"}</button>
      {view.connection?.status === "awaiting_consent" ? <section aria-label="Practice consent">
        <h2>Practice consent</h2><p>Allow this company session to read made-up movements from a fictional account for one hour. You can revoke or unlink at any time.</p>
        <button disabled={busy} onClick={() => void update("approve-fake-consent")}>Approve practice consent</button>
      </section> : null}
      {view.connection ? <>
        <button disabled={busy || view.credentialsUnavailable === true} onClick={() => void update("pull")}>Pull fictional movements</button>
        <button disabled={busy} onClick={() => void update("revoke")}>Revoke practice consent</button>
        <button disabled={busy} onClick={() => void update("unlink")}>Unlink fictional account</button>
      </> : null}
      {(["pending", "settled", "reversed"] as const).map(status => <section key={status} aria-label={`${status} movements`}>
        <h2>{status[0]!.toUpperCase() + status.slice(1)} movements</h2>
        <ul>{view.movements.filter(m => m.status === status).map(m => <li key={m.movementRef}>
          {m.movementRef} · {m.bookedOn} · {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(m.pence / 100)}
        </li>)}</ul>
        {!view.movements.some(m => m.status === status) ? <p>No {status} movements.</p> : null}
      </section>)}
    </> : !error ? <p role="status">{companies.length && !tenantId ? "Choose a company to practise." : "Loading practice bank…"}</p> : null}
  </main>;
}
