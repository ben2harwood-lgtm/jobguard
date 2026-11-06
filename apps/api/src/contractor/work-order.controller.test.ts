import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { WorkOrderApplication } from "./work-order.application.js";
import { WorkOrderController } from "./work-order.controller.js";
const id = "11111111-1111-4111-8111-111111111111";

describe("work-order write origin allow-list (adapter tests)", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  describe.each([["import", "importGenerated"], ["importSor", "importSorVersion"]] as const)("%s", (method, applicationMethod) => {
    it("reads configured allowed origins at request time and forwards the principal and body", async () => {
      const call = vi.spyOn(WorkOrderApplication.prototype, applicationMethod).mockResolvedValue({ ok: true } as never);
      const controller = new WorkOrderController(new Pool());
      const body = { version: "synthetic-origin-test.v1" };
      const write = (origin: string | undefined) => controller[method](`jg_session=${id}`, origin, body);
      vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", undefined);
      await write("http://localhost:3000");
      vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://practice.example.invalid");
      await write("https://practice.example.invalid");
      expect(call).toHaveBeenLastCalledWith({ version: "contractor-principal.v1", sessionId: id }, body);
      expect(call).toHaveBeenCalledTimes(2);
    });
    it.each(["http://localhost:3000", undefined, "https://unlisted.example.invalid", ""])("refuses origin %s with the existing status and body before the application call", (origin) => {
      vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://practice.example.invalid");
      const call = vi.spyOn(WorkOrderApplication.prototype, applicationMethod);
      const controller = new WorkOrderController(new Pool());
      const body = { version: "synthetic-origin-test.v1" };
      expect(() => controller[method](`jg_session=${id}`, origin, body)).toThrow(expect.objectContaining({ status: 404, response: { version: "work-order-error.v1", code: "NOT_FOUND", recoverable: false } }));
      expect(call).not.toHaveBeenCalled();
    });
    it("trims comma-separated entries", async () => {
      vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", " https://other.example.invalid , https://practice.example.invalid ");
      const call = vi.spyOn(WorkOrderApplication.prototype, applicationMethod).mockResolvedValue({ ok: true } as never);
      const controller = new WorkOrderController(new Pool());
      const body = { version: "synthetic-origin-test.v1" }, origin = "https://practice.example.invalid";
      await controller[method](`jg_session=${id}`, origin, body);
      expect(call).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: id }, body);
    });
  });
});
