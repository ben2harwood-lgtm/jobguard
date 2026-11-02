import "reflect-metadata";
import { Logger, type ArgumentsHost } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { FinalAccountLockError } from "@jobguard/core";
import { expect, it, vi } from "vitest";
import { CustomerInvoiceSv5preFilter } from "./customer-invoice-sv5pre.filter.js";

it.each(["FINAL_ACCOUNT_LOCK_REQUIRED", "FINAL_CHECK_NOT_COMPLETE", "FINAL_CHECK_FAILED"] as const)("PRE-Q4 Nest filter serializes only the typed %s refusal", code => {
 const response = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
 response.status.mockReturnValue(response);
 const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
 const error = new FinalAccountLockError(code);
 Object.assign(error, { detail: "private SQL diagnostic" });
 new CustomerInvoiceSv5preFilter().catch(error, host);
 expect(response.status).toHaveBeenCalledExactlyOnceWith(409);
 expect(response.json).toHaveBeenCalledExactlyOnceWith({ version: "final-check-invoice-error.v1", code });
 expect(response.setHeader).toHaveBeenCalledExactlyOnceWith("Cache-Control", "no-store");
});

it("PRE-Q4 Nest's fallback sanitizes unexpected SQL failures", () => {
 const response = {};
 const adapter = { isHeadersSent: vi.fn(() => false), reply: vi.fn(), end: vi.fn() };
 const host = { getArgByIndex: () => response } as unknown as ArgumentsHost;
 const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
 try {
  new BaseExceptionFilter(adapter as unknown as ConstructorParameters<typeof BaseExceptionFilter>[0]).catch(new Error("private SQL diagnostic"), host);
  expect(adapter.reply).toHaveBeenCalledExactlyOnceWith(response, { statusCode: 500, message: "Internal server error" }, 500);
 } finally { log.mockRestore(); }
});
