import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { AppModule } from "../app.module.js";
import { configureOpenApi } from "../bootstrap.js";
import { createWorkspaceApplication } from "../workspace/application.js";
import { BusinessValueApplication } from "./value-business.controller.js";
import { ValueV3Application, heldJobValueV3 } from "./value-v3.application.js";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("CH-9 registers both Nest reads with private metadata and the same services as workspace composition (no sockets)", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Pool).useValue({}).compile();
 const app = module.createNestApplication(), adapter = app.getHttpAdapter();
 const get = vi.spyOn(adapter, "get"), post = vi.spyOn(adapter, "post");
 const jobId = randomUUID();
 const job = heldJobValueV3(jobId);
 const business = { version: "business-value-result.v1", state: "unavailable", code: "BUSINESS_VALUE_BINDING_HELD" } as const;
 const jobRead = vi.spyOn(ValueV3Application.prototype, "readJob").mockResolvedValue(job);
 const businessRead = vi.spyOn(BusinessValueApplication.prototype, "readBusiness").mockResolvedValue(business);
 try {
  await app.init();
  for (const [path, result] of [["/value", business], ["/jobs/:id/value/v3", job]] as const) {
   const route = get.mock.calls.find(([p]) => p === path);
   expect(route).toBeDefined();
   expect(post.mock.calls.some(([p]) => p === path)).toBe(false);
   const response = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn(), setHeader: vi.fn(), getHeader: vi.fn() };
   await route![1]({ path: path.replace(":id", jobId), params: { id: jobId }, headers: { cookie: `jg_session=${randomUUID()}` }, query: {} }, response, vi.fn());
   expect(response.json).toHaveBeenCalledWith(result);
   if (path === "/value") {
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(response.set).toHaveBeenCalledWith("Vary", "Cookie");
   } else expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  }
  const workspace = createWorkspaceApplication({ pool: {} as Pool, sessionId: randomUUID() });
  expect(await workspace.valueV3.readJob(jobId)).toEqual(job);
  expect(await workspace.businessValue.readBusiness({})).toEqual(business);
  expect(jobRead).toHaveBeenCalledTimes(2);
  expect(businessRead).toHaveBeenCalledTimes(2);
  const doc = configureOpenApi(app) as { paths: Record<string, { get?: unknown }> };
  expect(doc.paths["/value"]?.get).toBeDefined();
  expect(doc.paths["/jobs/{id}/value/v3"]?.get).toBeDefined();
 } finally { await app.close(); }
});
