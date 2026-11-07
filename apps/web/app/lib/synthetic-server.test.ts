import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PracticeAccessError, RequestBindingRefusedError } from "@jobguard/db";
import { practiceFailure } from "./synthetic-server";

it.each([
 [new RequestBindingRefusedError("practice"), 401, "UNAUTHENTICATED"],
 [new RequestBindingRefusedError("real"), 403, "FORBIDDEN"],
 [new RequestBindingRefusedError("contractor_practice"), 403, "FORBIDDEN"],
 [new PracticeAccessError("UNAUTHENTICATED"), 401, "UNAUTHENTICATED"],
 [new PracticeAccessError("NOT_FOUND"), 404, "NOT_FOUND"],
 [new PracticeAccessError("SYNTHETIC_MODE_REQUIRED"), 403, "SYNTHETIC_MODE_REQUIRED"],
] as const)("returns only the established public code for %s", async (error, status, code) => {
 const response = practiceFailure(error)!;
 expect(response.status).toBe(status);
 expect(response.headers.get("Cache-Control")).toBe("no-store");
 expect(await response.json()).toEqual({ code });
});
it.each([
 Object.assign(new Error("private business SQL marker"), { code: "42501" }),
 Object.assign(new Error("private forged error marker"), { code: "FORBIDDEN", name: "RequestBindingRefusedError" }),
])("leaves ordinary SQL errors and forged error names to their existing handlers", error => {
 expect(practiceFailure(error)).toBeNull();
});
