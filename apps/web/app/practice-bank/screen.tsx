"use client";
import { useEffect, useState } from "react";
type View = { credentialsUnavailable?: boolean; version: "ais-practice-view.v1"; connection: { connectionId: string; status: string } | null;
  movements: { movementRef: string; status: "pending" | "settled" | "reversed"; pence: number; currency: "GBP"; bookedOn: string }[] };
const statuses: Record<string, string> = { awaiting_consent: "Waiting for practice consent", linked: "Fictional account linked for practice",
  revoked: "Practice consent revoked. Connect again for fresh consent.", unlinked: "Fictional account unlinked. Connect again for fresh consent.",
  expired: "Practice consent expired. Connect again for fresh consent.", token_revoked: "Practice credentials lost or revoked. Connect again for fresh consent." };
async function request(operation?: string, connectionId?: string): Promise<View> {
  const auth = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!auth.ok) throw new Error("Sign in to your company to practise.");
  const session = await auth.json() as { csrfToken?: string; memberships?: { tenantId: string }[] };
  const tenant = session.memberships?.[0]?.tenantId;
  if (!session.csrfToken || !tenant) throw new Error("Sign in to your company to practise.");
  const response = await fetch("/api/practice-bank", { cache: "no-store", credentials: "same-origin", method: operation ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-csrf-token": session.csrfToken, "x-tenant-id": tenant },
    ...(operation ? { body: JSON.stringify({ version: "ais-practice-command.v1", operation, ...(connectionId ? { connectionId } : {}) }) } : {}),
  });
  if (!response.ok) {
    const error = await response.json() as { code?: string };
    // Render only local text, never an unexpected server/provider exception.
    throw new Error(error.code === "AIS_INACTIVE" ? "Consent is inactive or expired. Connect again for fresh practice consent."
      : error.code === "AIS_TOKEN_REVOKED" ? statuses.token_revoked
      : error.code === "AIS_CALLBACK_INVALID" ? "Practice consent is missing, changed or already used. Connect again."
      : "Practice bank unavailable. Sign in and refresh to try again.");
  }
  return response.json() as Promise<View>;
}
export function PracticeBankScreen() {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void request().then(v => { if (active) setView(v); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; }; }, []);
  async function update(operation?: string) {
    setBusy(true); setError("");
    try { setView(await request(operation, operation === "start" ? undefined : view?.connection?.connectionId)); }
    catch (e) {
      setError(e instanceof Error ? e.message : "Practice bank unavailable.");
      // A failed pull may have recorded token loss. Reload the durable status.
      try { setView(await request()); } catch { setView(null); }
    } finally { setBusy(false); }
  }
  return <main className="workspace-page" style={{ overflowWrap: "anywhere" }}>
    <h1>Practice bank</h1>
    <p>Fictional account only. No real bank is connected.</p>
    <p>A bank line does not mark a case landed and does not start a fee.</p>
    {error ? <p role="alert">{error}</p> : null}
    {busy ? <p role="status">Updating practice bank…</p> : null}
    <button disabled={busy} onClick={() => void update()}>Refresh practice bank</button>
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
    </> : !error ? <p role="status">Loading practice bank…</p> : null}
  </main>;
}
