"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Session = { csrfToken: string; memberships: { id: string; tenantId: string; name: string }[] };
type Connection = { id: string; idpEntityId: string; spEntityId: string; callbackUrl: string; sessionLimitSeconds: number };
type Mapping = { connection_id: string; idp_group: string; revision: number; role: string; scope_kind: string; scope_id: string; enabled: boolean };
type View = {
  version: "sso-admin-view.v1"; environment: "synthetic_demo"; tenantId: string;
  connections: Connection[]; domains: { connection_id: string; domain: string }[]; mappings: Mapping[];
  events: { id: string; event_type: string; created_at: string }[];
};
const field = { display: "block", width: "100%", minHeight: 44, marginBottom: 16, boxSizing: "border-box" as const };
const roles = ["admin", "operative", "supervisor", "surveyor", "commercial_manager", "finance", "read_only"];

export default function ContractorIdentityPage() {
  const [session, setSession] = useState<Session | null>(null), [tenantId, setTenantId] = useState("");
  const [view, setView] = useState<View | null>(null), [connectionId, setConnectionId] = useState("");
  const [key, setKey] = useState(""), [domain, setDomain] = useState(""), [group, setGroup] = useState("");
  const [role, setRole] = useState("operative"), [scopeKind, setScopeKind] = useState("tenant"), [scopeId, setScopeId] = useState("");
  const [enabled, setEnabled] = useState(true), [busy, setBusy] = useState(false), [checking, setChecking] = useState(true);
  const [stale, setStale] = useState(true), [error, setError] = useState(""), [status, setStatus] = useState("Checking your persisted session…");
  const errorRef = useRef<HTMLParagraphElement>(null), generation = useRef(0);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function load(currentSession: Session, selectedTenant: string, selectedConnection?: string) {
    const request = ++generation.current; setBusy(true); setStale(true); setError("");
    try {
      const response = await fetch(`/api/auth/sso/new/start?requested_tenant_id=${encodeURIComponent(selectedTenant)}`, {
        cache: "no-store", headers: { "x-csrf-token": currentSession.csrfToken, "x-tenant-id": selectedTenant },
      });
      const body = await response.json() as View & { code?: string };
      if (!response.ok) throw new Error(body.code ?? "SSO_UNAVAILABLE");
      if (request !== generation.current) return;
      setView(body); setStale(false); setStatus("Persisted identity loaded");
      setConnectionId(body.connections.some(connection => connection.id === selectedConnection) ? selectedConnection! : body.connections[0]?.id ?? "");
    } catch (reason) {
      if (request !== generation.current) return;
      setStale(true); setError(reason instanceof Error ? reason.message : "SSO_UNAVAILABLE");
      setStatus("Identity settings are out-of-date. Reload persisted identity before making changes.");
    } finally { if (request === generation.current) setBusy(false); }
  }

  useEffect(() => {
    let disposed = false;
    void fetch("/api/auth/session", { cache: "no-store" }).then(async response => {
      if (response.status === 401) { if (!disposed) setStatus("Sign in to manage contractor identity."); return; }
      if (!response.ok) throw new Error("IDENTITY_UNAVAILABLE");
      const current = await response.json() as Session;
      if (disposed) return;
      setSession(current);
      const tenant = current.memberships[0]?.tenantId;
      if (!tenant) { setStatus("No active memberships are available."); return; }
      setTenantId(tenant); setScopeId(tenant); await load(current, tenant);
    }).catch(() => { if (!disposed) { setError("Identity storage could not be loaded. Reload this page to try again."); setStatus("Identity unavailable"); } })
      .finally(() => { if (!disposed) setChecking(false); });
    return () => { disposed = true; generation.current++; };
  }, []);

  async function mutate(event: FormEvent, action: string, fields: Record<string, unknown>) {
    event.preventDefault();
    if (!session || busy || stale) return;
    setBusy(true); setError(""); setStatus("Saving identity change…");
    let accepted = false;
    try {
      const response = await fetch(`/api/auth/sso/${action === "connection.create" ? "new" : connectionId}/start`, {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId },
        body: JSON.stringify({ version: "sso-admin.v1", requested_tenant_id: tenantId, action, ...fields }),
      });
      const body = await response.json() as { code?: string };
      if (!response.ok) throw new Error(body.code ?? "SSO_UNAVAILABLE");
      accepted = true;
      await load(session, tenantId, action === "connection.create" ? String(fields.id) : connectionId);
      // load only clears stale after the authoritative projection is available.
    } catch (reason) {
      setStale(true); setError(reason instanceof Error ? reason.message : "SSO_UNAVAILABLE");
      setStatus(accepted ? "The change was acknowledged but settings are out-of-date. Reload persisted identity." : "The change was not confirmed. Reload persisted identity before making changes.");
    } finally { setBusy(false); }
  }
  const blocked = checking || busy || stale, selected = view?.connections.find(connection => connection.id === connectionId);
  const mapping = view?.mappings.filter(item => item.connection_id === connectionId && item.idp_group === group).sort((a, b) => b.revision - a.revision)[0];
  const tenantOnly = role === "finance";

  return <main style={{ maxWidth: 720, margin: "24px auto", padding: 20, boxSizing: "border-box", overflowWrap: "anywhere" }}>
    <h1>Contractor SAML identity</h1>
    <p role="note" aria-label="SAML sandbox notice">Practice sandbox — synthetic identities only. The in-process test identity provider is the only permitted provider. No live SSO route is approved.</p>
    <p><a href="/admin/contractor" style={field}>Contractor organisation practice</a></p>
    <p role="status">{status}</p>
    {error && <p role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
    {!checking && !session && <a href="/sign-in" style={field}>Sign in to your verified account</a>}
    {session && <>
      <label htmlFor="sso-tenant-selector">Verified business</label>
      <select id="sso-tenant-selector" style={field} value={tenantId} disabled={busy} onChange={event => {
        const next = event.target.value; setTenantId(next); setScopeKind("tenant"); setScopeId(next); setView(null); setConnectionId(""); void load(session, next);
      }}>{session.memberships.map(membership => <option key={membership.id} value={membership.tenantId}>{membership.name} ({membership.tenantId})</option>)}</select>
      {view && <p>Tenant: <span data-testid="sso-tenant">{view.tenantId}</span></p>}
      <button type="button" style={field} disabled={busy || !tenantId} onClick={() => void load(session, tenantId, connectionId)}>Reload persisted identity</button>
      <section aria-label="Test SAML connections">
        <h2>Test SAML connections</h2>
        <p>Provide the generated public key from the test identity provider. Never enter a private key or real provider metadata.</p>
        <form onSubmit={event => void mutate(event, "connection.create", { id: crypto.randomUUID(), idpCert: key })}>
          <label htmlFor="sso-public-key">Test identity provider public key</label>
          <textarea id="sso-public-key" style={{ ...field, minHeight: 140 }} value={key} onChange={event => setKey(event.target.value)} required disabled={blocked} />
          <button type="submit" style={field} disabled={blocked}>Create test SAML connection</button>
        </form>
        {view?.connections.map(connection => <article key={connection.id} data-testid="sso-connection"><h3>Connection {connection.id}</h3><p>Identity provider: {connection.idpEntityId}</p><p>Service provider: {connection.spEntityId}</p><p>Callback: {connection.callbackUrl}</p><p>Maximum session lifetime: {connection.sessionLimitSeconds} seconds</p></article>)}
      </section>
      {!!view?.connections.length && <>
        <label htmlFor="sso-connection-selector">SAML connection</label>
        <select id="sso-connection-selector" style={field} disabled={blocked} value={connectionId} onChange={event => setConnectionId(event.target.value)}>{view.connections.map(connection => <option key={connection.id} value={connection.id}>{connection.id}</option>)}</select>
        <section aria-label="Verified domains"><h2>Verified domains</h2><p>Only fictional .invalid domains are eligible. This synthetic proof does not verify a real domain.</p>
          <form onSubmit={event => void mutate(event, "domain.verify", { connectionId, domain, proof: `synthetic-domain:${connectionId}:${domain}` })}>
            <label htmlFor="sso-domain">Fictional verified domain</label><input id="sso-domain" style={field} value={domain} onChange={event => setDomain(event.target.value)} disabled={blocked} required />
            <button type="submit" style={field} disabled={blocked || !selected}>Verify test domain</button>
          </form>
          {view.domains.filter(item => item.connection_id === connectionId).map(item => <p key={item.domain} data-testid="sso-domain">{item.domain}</p>)}
        </section>
        <section aria-label="Explicit role mappings"><h2>Explicit group mappings</h2><p>Finance and commercial manager authority require an explicit mapping. Unmapped groups grant no contractor authority.</p>
          <form onSubmit={event => void mutate(event, "mapping.set", { connectionId, group, role, scope: { kind: scopeKind, id: scopeId }, expectedRevision: mapping?.revision ?? 0, enabled })}>
            <label htmlFor="sso-group">Identity provider group</label><input id="sso-group" style={field} value={group} onChange={event => setGroup(event.target.value)} required disabled={blocked} />
            <label htmlFor="sso-role">Mapped contractor role</label><select id="sso-role" style={field} value={role} disabled={blocked} onChange={event => { setRole(event.target.value); if (event.target.value === "finance") { setScopeKind("tenant"); setScopeId(tenantId); } }}>{roles.map(value => <option key={value} value={value}>{value}</option>)}</select>
            <label htmlFor="sso-scope-kind">Grant scope</label><select id="sso-scope-kind" style={field} disabled={blocked} value={scopeKind} onChange={event => { setScopeKind(event.target.value); setScopeId(event.target.value === "tenant" ? tenantId : ""); }}>{(tenantOnly ? ["tenant"] : ["tenant", "region", "branch", "team"]).map(value => <option key={value} value={value}>{value}</option>)}</select>
            <label htmlFor="sso-scope-id">Scope identity</label><input id="sso-scope-id" style={field} disabled={blocked || scopeKind === "tenant"} value={scopeId} onChange={event => setScopeId(event.target.value)} required />
            <label style={{ ...field, display: "flex", alignItems: "center", gap: 12 }}><input type="checkbox" checked={enabled} disabled={blocked} onChange={event => setEnabled(event.target.checked)} />Mapping enabled</label>
            <p>Current group revision: {mapping?.revision ?? 0}</p>
            <button type="submit" style={field} disabled={blocked || !selected}>Save explicit mapping</button>
          </form>
          {view.mappings.filter(item => item.connection_id === connectionId).map(item => <p key={`${item.idp_group}:${item.revision}`} data-testid="sso-mapping">{item.idp_group} → {item.role}; {item.scope_kind} {item.scope_id}; revision {item.revision}; {item.enabled ? "enabled" : "disabled"}</p>)}
        </section>
      </>}
      <section aria-label="Identity audit events"><h2>Identity audit events</h2><p>Persisted event references for this business.</p>{view?.events.map(event => <p data-testid="sso-event" key={event.id}>{event.event_type} · {event.created_at} · {event.id}</p>)}</section>
    </>}
  </main>;
}
