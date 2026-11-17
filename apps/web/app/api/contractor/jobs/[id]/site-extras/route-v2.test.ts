import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logSiteExtraV1, logSiteExtraV2 } from "@jobguard/core";
const { log, workspace } = vi.hoisted(() => { const log = vi.fn(); return { log, workspace: vi.fn<() => Promise<{ siteExtras: { log: (jobId: string, raw: unknown) => Promise<unknown> } }>>(async () => ({ siteExtras: { log } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { POST } from "./route";
const job = "00000000-0000-4000-8000-000000000001";
const v1 = () => ({ version: "log-site-extra.v1", commandId: crypto.randomUUID(), note: "Fictional note", description: "Fictional extra" });
const v2 = () => ({ ...v1(), version: "log-site-extra.v2", siteVisitId: crypto.randomUUID() });
const post = (body: unknown) => POST(new Request("https://app.fictional.invalid/api/contractor/jobs/ignored/site-extras", { method: "POST", headers: { "content-type": "application/json", origin: "https://app.fictional.invalid" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: job }) });
const logged = () => ({ version: "site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job, extraId: crypto.randomUUID(), state: "logged" });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_URL", "app.fictional.invalid"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", ""); log.mockReset(); workspace.mockClear(); log.mockResolvedValue(logged()); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3b the site-extras route accepts both body versions", () => {
 it("[B17-SIDE] a version 1 body and a version 2 body are both accepted, each reaches the service parsed as its own version, and both answer 201 with the same shape", async () => {
  const one = v1(), two = v2();
  const first = await post(one), second = await post(two);
  expect(first.status).toBe(201); expect(second.status).toBe(201);
  expect(log.mock.calls[0]).toEqual([job, logSiteExtraV1.parse(one)]); expect(log.mock.calls[1]).toEqual([job, logSiteExtraV2.parse(two)]);
  expect(Object.keys(await first.json()).sort()).toEqual(Object.keys(await second.json()).sort());
 });
 it("[B17] a version 1 body that names a visit, a version 2 body that does not, or one with a malformed visit, is INVALID_COMMAND before the service", async () => {
  const { siteVisitId: _removed, ...without } = v2();
  for (const body of [{ ...v1(), siteVisitId: crypto.randomUUID() }, without, { ...v2(), siteVisitId: "invalid" }, { ...v2(), siteVisitId: null }, { ...v2(), tenantId: crypto.randomUUID() }]) {
   const response = await post(body); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-extra-error.v1", code: "INVALID_COMMAND" });
  }
  expect(log).not.toHaveBeenCalled();
 });
});
