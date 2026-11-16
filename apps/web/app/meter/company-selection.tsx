"use client";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";

const tenantIdSchema = z.guid();
const sessionSchema = z.object({ principal: z.object({ id: z.string(), sessionId: z.string() }).optional(), csrfToken: z.string().min(1), memberships: z.array(z.object({
  tenantId: tenantIdSchema, name: z.string().optional(), id: z.string().optional(), role: z.string().optional(),
})) });
export type CompanySession = z.infer<typeof sessionSchema>;
export type SelectedCompany = { tenantId: string; name: string; csrfToken: string; authority: string };
export async function companySession(fetcher: typeof fetch = fetch): Promise<CompanySession> {
  const response = await fetcher("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw new Error(response.status < 500 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  }
  const parsed = sessionSchema.safeParse(await response.json());
  if (!parsed.success || !parsed.data.memberships.length) throw new Error("SIGN_IN_REQUIRED");
  return parsed.data;
}
export function selectCompany(session: CompanySession, selection?: string | string[]): SelectedCompany | null {
  if (selection === undefined && session.memberships.length > 1) return null;
  const tenantId = selection === undefined ? session.memberships[0]?.tenantId : selection;
  if (typeof tenantId !== "string" || !tenantIdSchema.safeParse(tenantId).success) throw new Error("COMPANY_SELECTION_INVALID");
  const matches = session.memberships.filter(member => member.tenantId === tenantId);
  if (matches.length !== 1) throw new Error("COMPANY_SELECTION_INVALID");
  return { tenantId, name: matches[0]!.name || tenantId, csrfToken: session.csrfToken, authority: JSON.stringify([session.principal, matches[0]!.id, matches[0]!.role, session.csrfToken]) };
}
export function companyHeaders(company: SelectedCompany) {
  return { "x-csrf-token": company.csrfToken, "x-tenant-id": company.tenantId };
}
export class CompanyAuthorityError extends Error {}
/** Refresh authority before any import request; a new session requires a new preview. */
export async function companyRequest(fetcher: typeof fetch, company: SelectedCompany, path: string, init?: RequestInit) {
  let current: SelectedCompany | null;
  try {
    current = selectCompany(await companySession(fetcher), company.tenantId);
    if (!current || current.authority !== company.authority) throw new Error("Company session changed. Reload before importing.");
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "READ_UNAVAILABLE";
    throw new CompanyAuthorityError(message === "SIGN_IN_REQUIRED" ? "Sign in to your company before importing."
      : message === "COMPANY_SELECTION_INVALID" ? "The selected company is no longer authorised. Reload before importing."
      : message === "READ_UNAVAILABLE" ? "Company information is unavailable. Reload before importing." : message);
  }
  if (init?.signal?.aborted) throw new Error("COMPANY_SELECTION_CHANGED");
  const response = await fetcher(path, { ...init, cache: "no-store", credentials: "same-origin",
    headers: { ...Object.fromEntries(new Headers(init?.headers)), ...companyHeaders(current) } });
  if (response.status === 401 || response.status === 403) {
    await response.text().catch(() => "");
    throw new CompanyAuthorityError("Sign in to the selected company before importing.");
  }
  return response;
}
export function CompanyWorkspace({ initialTenant, children }: {
  initialTenant?: string | string[] | undefined; children: (company: SelectedCompany) => ReactNode;
}) {
  const [session, setSession] = useState<CompanySession | null>(null);
  const [selection, setSelection] = useState(initialTenant);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let latest = 0;
    const refresh = () => {
      const request = ++latest;
      void companySession().then(value => {
        if (!active || request !== latest) return;
        setSession(value); setError("");
        // Pin even the single-company default; revocation must never select another company.
        if (initialTenant === undefined) {
          const choice = selectCompany(value);
          if (choice) setSelection(previous => previous ?? choice.tenantId);
        }
      }).catch(reason => {
        if (active && request === latest) setError(reason instanceof Error ? reason.message : "READ_UNAVAILABLE");
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  let selected: SelectedCompany | null = null;
  let selectionError = "";
  if (session) {
    try { selected = selectCompany(session, selection); } catch { selectionError = "This company selection is unavailable. Choose an authorised company."; }
  }
  return <>
    {session && <label>Company<select aria-label="Company" value={selected?.tenantId ?? ""} onChange={event => {
      const next = event.target.value;
      setSelection(next);
      const url = new URL(window.location.href); url.searchParams.set("tenant", next);
      window.history.replaceState(null, "", url);
    }}><option value="" disabled>Choose a company</option>{session.memberships.map((member, index) =>
      <option key={`${member.tenantId}:${index}`} value={member.tenantId}>{member.name || member.tenantId}</option>)}</select></label>}
    {error ? <p role="alert">{error === "SIGN_IN_REQUIRED" ? <a href="/sign-in">Sign in to your company to continue.</a> : "Company information is unavailable. Reload to try again."}</p>
      : selectionError ? <p role="alert">{selectionError}</p>
      : selected ? <section key={`${selected.tenantId}:${selected.authority}`} aria-label="Selected company"><p>Company: {selected.name}</p>{children(selected)}</section>
      : <p role="status">{session ? "Choose a company to continue." : "Loading company…"}</p>}
  </>;
}
