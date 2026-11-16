import { expect, it, vi } from "vitest";
import { companyRequest, companySession, selectCompany, CompanyAuthorityError } from "./company-selection";
const a = { tenantId: "a1500000-0000-4000-8000-000000000001", name: "Fictional A" }, b = { tenantId: "a1500000-0000-4000-8000-000000000002", name: "Fictional B" };
const session = { csrfToken: "csrf", memberships: [a, b] };
it("requires a choice with two memberships, binds B regardless of order, and permits one default", () => {
  expect(selectCompany(session)).toBeNull();
  expect(selectCompany(session, b.tenantId)).toMatchObject({ tenantId: b.tenantId, name: b.name });
  expect(selectCompany({ ...session, memberships: [b, a] }, b.tenantId)).toEqual(selectCompany(session, b.tenantId));
  expect(selectCompany({ ...session, memberships: [a] })?.tenantId).toBe(a.tenantId);
});
it.each(["", "foreign", "a1500000-0000-4000-8000-000000000002?tenant=a1500000-0000-4000-8000-000000000001", ["a1500000-0000-4000-8000-000000000002", "a1500000-0000-4000-8000-000000000001"]])("refuses invalid/ambiguous selection %j", selection => {
  expect(() => selectCompany(session, selection)).toThrow("COMPANY_SELECTION_INVALID");
});
it("refuses duplicate or revoked exact membership without falling back", () => {
  expect(() => selectCompany({ ...session, memberships: [b, b] }, b.tenantId)).toThrow();
  expect(() => selectCompany({ ...session, memberships: [a] }, b.tenantId)).toThrow();
});
it.each(["source", "read", "preview", "adopt", "catch"])("refreshes the exact B authority for %s", async action => {
  const selected = selectCompany(session, b.tenantId)!;
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ ...session, memberships: [b, a] })).mockResolvedValueOnce(Response.json({}));
  await companyRequest(fetcher, selected, `/import/${action}`, { method: ["source", "read"].includes(action) ? "GET" : "POST" });
  expect(fetcher.mock.calls[1]![1]).toMatchObject({ cache: "no-store", credentials: "same-origin", headers: { "x-tenant-id": b.tenantId, "x-csrf-token": "csrf" } });
});
it.each([{ ...session, memberships: [a] }, { ...session, csrfToken: "new-session" }])("refuses a write on changed authority", async current => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(current));
  await expect(companyRequest(fetcher, selectCompany(session, b.tenantId)!, "/adopt", { method: "POST" })).rejects.toBeInstanceOf(CompanyAuthorityError);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not send an old selection's write after a delayed session refresh", async () => {
  const controller = new AbortController();
  let finish!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = companyRequest(fetcher, selectCompany(session, b.tenantId)!, "/adopt", { method: "POST", signal: controller.signal });
  controller.abort(); finish(Response.json(session));
  await expect(pending).rejects.toThrow("COMPANY_SELECTION_CHANGED");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([401, 403, 503])("drains refused sessions %s", async status => {
  const response = Response.json({}, { status });
  await expect(companySession(vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow(status < 500 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  expect(response.bodyUsed).toBe(true);
});
it.each([401, 403])("drains refused business reads/writes and invalidates their authority (%s)", async status => {
  const response = Response.json({}, { status });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(response);
  await expect(companyRequest(fetcher, selectCompany(session, b.tenantId)!, "/adopt", { method: "POST" })).rejects.toBeInstanceOf(CompanyAuthorityError);
  expect(response.bodyUsed).toBe(true);
});
