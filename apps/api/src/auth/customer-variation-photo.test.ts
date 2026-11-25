import { describe, expect, it, vi } from "vitest";
import type { IdentityApplication } from "./identity.application.js";
import { CustomerRefused } from "./customer-signin.js";
import { CustomerVariationApplication, customerVariationFailure } from "./customer-variation.js";

// QW-1: photos on variations, customer side. SQL authority is proved in packages/db variation-revision-photo.integration.test.ts.
const job = "20000000-0000-4000-8000-000000000002", tenant = "10000000-0000-4000-8000-000000000001", customer = "30000000-0000-4000-8000-000000000003";
const evidence = "40000000-0000-4000-8000-000000000004";
const origin = "https://fixture.invalid", token = `${tenant}.${job}.${customer}.${"a".repeat(43)}`;
const headers = { origin, cookie: `jobguard_customer=${token}` };
const read = { version: "customer-variation-photo-read.v1", jobId: job, evidenceId: evidence };
function fixture(signer?: (o: { key: string; versionId: string }) => Promise<string>) {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [{ result: { version: "customer-session.v1", jobId: job } }] })
    .mockResolvedValueOnce({ rows: [{ result: { version: "customer-variation-photo.v1", objectKey: "tenants/x/uploads/y/original", objectVersionId: "v7", contentType: "image/jpeg" } }] });
  const identity = { allowedOrigin: origin, provider: { digest: (x: string) => `hmac:${x}`, repository: { pool: { query } } } } as unknown as IdentityApplication;
  return { query, app: new CustomerVariationApplication(identity, "synthetic_demo", signer) };
}
describe("QW-1 customer photo download", () => {
  it("resolves the session, asks SQL for exactly one linked photo, and signs that exact version", async () => {
    const signer = vi.fn().mockResolvedValue("https://evidence.invalid/signed");
    const f = fixture(signer);
    expect(await f.app.run("variation-photo", read, { headers })).toEqual({ version: "customer-variation-photo-url.v1", downloadUrl: "https://evidence.invalid/signed", expiresInSeconds: 60 });
    expect(f.query.mock.calls[0]![0]).toContain("customer_portal_use");
    expect(f.query.mock.calls[1]![0]).toContain("identity.customer_variation_photo");
    expect(f.query.mock.calls[1]![1]).toEqual([tenant, job, customer, `hmac:customer-session:${token}`, evidence]);
    expect(signer).toHaveBeenCalledWith({ key: "tenants/x/uploads/y/original", versionId: "v7" });
  });
  it("refuses with no evidence store, a malformed request, or another job, before any lookup", async () => {
    for (const [signer, raw] of [[undefined, read], [vi.fn(), { ...read, evidenceId: "nope" }], [vi.fn(), { ...read, extra: 1 }], [vi.fn(), { ...read, jobId: customer }]] as const) {
      const f = fixture(signer as never);
      await expect(f.app.run("variation-photo", raw, { headers })).rejects.toBeInstanceOf(CustomerRefused);
      if (signer === undefined || (raw as { evidenceId: string }).evidenceId === "nope" || "extra" in raw) expect(f.query).not.toHaveBeenCalled();
    }
  });
  it("does not sign when SQL refuses the photo", async () => {
    const signer = vi.fn();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ result: { version: "customer-session.v1", jobId: job } }] })
      .mockRejectedValueOnce(Object.assign(new Error("CUSTOMER_REFUSED"), { code: "42501" }));
    const identity = { allowedOrigin: origin, provider: { digest: (x: string) => `hmac:${x}`, repository: { pool: { query } } } } as unknown as IdentityApplication;
    await expect(new CustomerVariationApplication(identity, "synthetic_demo", signer).run("variation-photo", read, { headers })).rejects.toBeInstanceOf(CustomerRefused);
    expect(signer).not.toHaveBeenCalled();
  });
  it("maps a changed photo list to a 409 the customer can act on", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ result: { version: "customer-session.v1", jobId: job } }] })
      .mockRejectedValueOnce(Object.assign(new Error("PHOTOS_CHANGED"), { code: "42501" }));
    const identity = { allowedOrigin: origin, provider: { digest: (x: string) => `hmac:${x}`, repository: { pool: { query } } } } as unknown as IdentityApplication;
    const command = { version: "customer-portal-approval.v1", commandId: customer, jobId: job, expectedJobRevision: 1,
      target: { kind: "variation", id: tenant, revision: 2, hash: "a".repeat(64), amount: { pence: 5000, currency: "GBP" }, photos: ["b".repeat(64)] } };
    const error = await new CustomerVariationApplication(identity, "synthetic_demo").run("variation-approvals", command, { headers }).catch(e => e);
    expect(customerVariationFailure(error)).toMatchObject({ status: 409, body: { code: "PHOTOS_CHANGED" } });
  });
});
