import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectorPromotionRepository } from "@jobguard/db";
import { ConnectorPromotionApplication } from "./promotion.application.js";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("refuses machine/connector principals and production before storage", () => {
  const pool = new Pool(), app = new ConnectorPromotionApplication(pool), query = vi.spyOn(pool,"query");
  vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
  for (const principal of [{version:"connector-principal.v1",bindingId:randomUUID()}, {sessionId:randomUUID(),actor:"machine"}, {version:"contractor-principal.v1",sessionId:randomUUID(),tenantId:randomUUID()}]) {
    expect(() => app.list(principal)).toThrow("UNAUTHENTICATED");
  }
  vi.stubEnv("JOBGUARD_ENV","production");
  expect(() => app.list({version:"contractor-principal.v1",sessionId:randomUUID()})).toThrow("MODE_FORBIDDEN");
  expect(query).not.toHaveBeenCalled();
});
it("passes only the persisted session and strict source identity; arbitrary authority fields refuse before database access", async () => {
  vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
  const pool = new Pool(), app = new ConnectorPromotionApplication(pool), sessionId = randomUUID();
  const list = vi.spyOn(ConnectorPromotionRepository.prototype,"list").mockResolvedValue([]);
  await app.list({version:"contractor-principal.v1",sessionId}); expect(list).toHaveBeenCalledWith(sessionId);
  const input = {version:"connector-promotion.v1",namespace:"fixture:source",eventId:"fixture:event"};
  const connect = vi.spyOn(pool,"connect");
  for (const extra of [{tenantId:randomUUID()},{role:"owner"},{jobId:randomUUID()},{document:"raw"},{eventId:"fixture:event\n"},{commandId:randomUUID()}]) {
    await expect(app.promote({version:"contractor-principal.v1",sessionId},{...input,...extra})).rejects.toMatchObject({code:"INVALID_COMMAND"});
  }
  expect(connect).not.toHaveBeenCalled();
});
