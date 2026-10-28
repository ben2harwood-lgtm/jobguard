import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ValueV3Application, heldJobValueV3, ValueV3ReadError } from "./value-v3.application.js";
import { ValueV3Controller } from "./value-v3.controller.js";

const id = randomUUID();
afterEach(() => vi.restoreAllMocks());
function response() {
 const headers: Record<string, string> = {};
 return { headers, setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }) };
}
it("CH9-J01/05 sets private no-store before success and delegates without writes", async () => {
 const read = vi.spyOn(ValueV3Application.prototype, "readJob").mockResolvedValue(heldJobValueV3(id));
 const res = response();
 expect(await new ValueV3Controller({} as Pool).get(id, {}, "jg_session=fictional", res)).toEqual(heldJobValueV3(id));
 expect(read).toHaveBeenCalledWith(id, {});
 expect(res.headers["Cache-Control"]).toBe("private, no-store");
 expect(res.headers["Vary"]).toBe("Cookie");
 expect(res.setHeader.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]!);
});
it.each(["NOT_FOUND", "UNAUTHENTICATED", "VALUE_V3_QUERY_UNBOUND", "VALUE_V3_SOURCE_REJECTED", "DATABASE_UNAVAILABLE"])("CH9-J01/02/09 keeps %s private and sanitized", async code => {
 vi.spyOn(ValueV3Application.prototype, "readJob").mockRejectedValue(
  code.startsWith("VALUE_") ? new ValueV3ReadError(code as "VALUE_V3_QUERY_UNBOUND" | "VALUE_V3_SOURCE_REJECTED") : Object.assign(new Error("private SQL/session/tenant bytes"), { code }));
 const res = response();
 try { await new ValueV3Controller({} as Pool).get(id, {}, undefined, res); expect.fail("must reject"); }
 catch (error) {
  const result = error as { getResponse(): unknown; getStatus(): number };
  expect(JSON.stringify(result.getResponse())).not.toContain("private SQL");
  expect(result.getStatus()).toBe(code === "NOT_FOUND" ? 404 : code === "UNAUTHENTICATED" ? 401 : code === "VALUE_V3_QUERY_UNBOUND" ? 400 : 503);
 }
 expect(res.headers["Cache-Control"]).toBe("private, no-store");
});
it("CH9-J01 defers request-scoped reader construction until application authority", async () => {
 const factory = vi.fn(() => ({ readJob: vi.fn(async () => heldJobValueV3(id)) }));
 vi.spyOn(ValueV3Application.prototype, "readJob").mockRejectedValue(Object.assign(new Error("UNAUTHENTICATED"), { code: "UNAUTHENTICATED" }));
 await expect(new ValueV3Controller({} as Pool, factory).get(id, {}, undefined, response())).rejects.toHaveProperty("status", 401);
 expect(factory).not.toHaveBeenCalled();
});
