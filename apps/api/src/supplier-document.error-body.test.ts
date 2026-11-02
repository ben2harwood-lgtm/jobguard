import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod/v3";
import { PracticeAccess } from "./practice-access.js";
import { SupplierDocumentApplication } from "./supplier-document.application.js";

afterEach(() => vi.restoreAllMocks());
it("preserves the supplier regex error body's bytes, including issue key order", async () => {
  vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context: {} } as never);
  const app = new SupplierDocumentApplication({} as Pool);
  const legacy = z.object({ accepted: z.string().regex(/^\d+(?:\.\d{1,6})?$/u) }).safeParse({ accepted: "1.1234567" });
  expect(legacy.success).toBe(false);
  if (legacy.success) throw new Error("Expected legacy rejection");
  const error: unknown = await app.receipt("00000000-0000-0000-0000-000000000001", {
    version: "goods-receipt.v1", commandId: "00000000-0000-0000-0000-000000000002", accepted: "1.1234567", rejected: "0", expectedRevision: 1,
  }).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(Error);
  expect(JSON.stringify({ code: (error as Error).message })).toBe(JSON.stringify({ code: legacy.error.message }));
});
