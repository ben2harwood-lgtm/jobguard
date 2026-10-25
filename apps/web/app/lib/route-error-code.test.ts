import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const state = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("./synthetic-server", () => ({ hasSyntheticSession: () => true, practiceFailure: () => null, syntheticPool: () => ({}) }));
vi.mock("./workspace-server", () => {
  const service: unknown = new Proxy(() => { throw state.error; }, { get: (_target, key) => key === "then" ? undefined : service });
  return { workspaceApplication: async () => service };
});

vi.mock("@jobguard/api/commercial-integrity", () => ({ CommercialIntegrityApplication: class {
  view() { throw state.error; }
  review() { throw state.error; }
} }));

const routes = [
  { name: "jobs/[id]/materials/route.ts", load: () => import("../api/jobs/[id]/materials/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => code.includes("STALE")?409:400 },
  { name: "jobs/[id]/purchase-orders/revisions/route.ts", load: () => import("../api/jobs/[id]/purchase-orders/revisions/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code==="IDEMPOTENCY_CONFLICT"||code.includes("STALE")?409:400 },
  { name: "jobs/[id]/purchase-orders/placement/route.ts", load: () => import("../api/jobs/[id]/purchase-orders/placement/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code.includes("CONFLICT")||code.includes("STALE")?409:400 },
  { name: "jobs/[id]/quotes/activation/route.ts", load: () => import("../api/jobs/[id]/quotes/activation/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => code.includes("CONFLICT")||code.includes("REQUIRED")?409:400 },
  { name: "jobs/[id]/quotes/acceptance/route.ts", load: () => import("../api/jobs/[id]/quotes/acceptance/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => code.includes("CONFLICT")||code.includes("STALE")?409:400 },
  { name: "jobs/[id]/variations/route.ts", load: () => import("../api/jobs/[id]/variations/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => code==="VARIATION_REVISION_CONFLICT"||code.includes("CURRENT")?409:400 },
  { name: "jobs/[id]/supplier-matches/route.ts", load: () => import("../api/jobs/[id]/supplier-matches/route.js"), validationCode: "INVALID_MATCH", action: "", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code.includes("CONFLICT")?409:400 },
  { name: "jobs/[id]/supplier-matches/corrections/route.ts", load: () => import("../api/jobs/[id]/supplier-matches/corrections/route.js"), validationCode: "INVALID_MATCH", action: "", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code.includes("CONFLICT")?409:400 },
  { name: "jobs/[id]/relevance-inbox/decisions/[decisionId]/route.ts", load: () => import("../api/jobs/[id]/relevance-inbox/decisions/[decisionId]/route.js"), validationCode: "INVALID_INBOX", action: "", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code==="IDEMPOTENCY_CONFLICT"?409:code.includes("NOT_FOUND")?404:400 },
  { name: "jobs/[id]/relevance-inbox/[action]/route.ts", load: () => import("../api/jobs/[id]/relevance-inbox/[action]/route.js"), validationCode: "INVALID_INBOX", action: "seed", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code.includes("CONFLICT")?409:400 },
  { name: "jobs/[id]/final-account/route.ts", load: () => import("../api/jobs/[id]/final-account/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => code.includes("STALE")?409:400 },
  { name: "jobs/[id]/customer-invoices/route.ts", load: () => import("../api/jobs/[id]/customer-invoices/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => code.includes("STALE")?409:400 },
  { name: "jobs/[id]/customer-invoices/[invoiceId]/credit-notes/route.ts", load: () => import("../api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => code.includes("STALE")||code.includes("EXCEEDS")?409:400 },
  { name: "jobs/[id]/customer-invoices/[invoiceId]/credit-notes/preview/route.ts", load: () => import("../api/jobs/[id]/customer-invoices/[invoiceId]/credit-notes/preview/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => code.includes("EXCEEDS")?409:400 },
  { name: "jobs/[id]/readiness/[action]/route.ts", load: () => import("../api/jobs/[id]/readiness/[action]/route.js"), validationCode: "INVALID_READINESS", action: "plan", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"||code==="IDEMPOTENCY_CONFLICT"?409:code.includes("CONFLICT")?409:400 },
  { name: "jobs/[id]/supplier-documents/receipts/route.ts", load: () => import("../api/jobs/[id]/supplier-documents/receipts/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code==="IDEMPOTENCY_CONFLICT"||code.includes("STALE")?409:400 },
  { name: "jobs/[id]/supplier-documents/intake/route.ts", load: () => import("../api/jobs/[id]/supplier-documents/intake/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code==="IDEMPOTENCY_CONFLICT"||code.includes("STALE")?409:400 },
  { name: "jobs/[id]/supplier-documents/facts/confirm/route.ts", load: () => import("../api/jobs/[id]/supplier-documents/facts/confirm/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code.includes("STALE")||code.includes("IDEMPOTENCY")?409:400 },
  { name: "jobs/[id]/things-to-check/[action]/route.ts", load: () => import("../api/jobs/[id]/things-to-check/[action]/route.js"), validationCode: "INVALID_FINDING", action: "evaluate", method: "POST", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:code==="JOB_NOT_LIVE"?409:code.includes("CONFLICT")?409:400 },
  { name: "material-rates/route.ts", load: () => import("../api/material-rates/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => code.includes("STALE")?409:400 },
  { name: "decisions/route.ts", load: () => import("../api/decisions/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 400 },
  { name: "jobs/[id]/commercial-integrity/reviews/route.ts", load: () => import("../api/jobs/[id]/commercial-integrity/reviews/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/commercial-integrity/route.ts", load: () => import("../api/jobs/[id]/commercial-integrity/route.js"), validationCode: "UNAVAILABLE", action: "", method: "GET", mainStatus: (code: string) => 403 },
  { name: "jobs/[id]/customer-invoices/[invoiceId]/route.ts", load: () => import("../api/jobs/[id]/customer-invoices/[invoiceId]/route.js"), validationCode: "NOT_FOUND", action: "", method: "GET", mainStatus: (code: string) => 404 },
  { name: "jobs/[id]/fee-illustration/route.ts", load: () => import("../api/jobs/[id]/fee-illustration/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/final-account/dispositions/route.ts", load: () => import("../api/jobs/[id]/final-account/dispositions/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => /ALREADY_LOCKED|IDEMPOTENCY|STALE|SOURCE_CHANGED/u.test(code) ? 409 : 400 },
  { name: "jobs/[id]/final-account/lock/route.ts", load: () => import("../api/jobs/[id]/final-account/lock/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => /ALREADY_LOCKED|IDEMPOTENCY|STALE|SOURCE_CHANGED/u.test(code) ? 409 : 400 },
  { name: "jobs/[id]/final-account/review-extras/route.ts", load: () => import("../api/jobs/[id]/final-account/review-extras/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => /ALREADY_LOCKED|IDEMPOTENCY|STALE|SOURCE_CHANGED/u.test(code) ? 409 : 400 },
  { name: "jobs/[id]/final-account/terms/route.ts", load: () => import("../api/jobs/[id]/final-account/terms/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => /ALREADY_LOCKED|IDEMPOTENCY|STALE|SOURCE_CHANGED/u.test(code) ? 409 : 400 },
  { name: "jobs/[id]/purchase-orders/route.ts", load: () => import("../api/jobs/[id]/purchase-orders/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "GET", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/quotes/acceptance/disposition/route.ts", load: () => import("../api/jobs/[id]/quotes/acceptance/disposition/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => 409 },
  { name: "jobs/[id]/quotes/delivery/[action]/route.ts", load: () => import("../api/jobs/[id]/quotes/delivery/[action]/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "execute", method: "POST", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/quotes/delivery/route.ts", load: () => import("../api/jobs/[id]/quotes/delivery/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => code === "QUOTE_CHANGED" ? 409 : 400 },
  { name: "jobs/[id]/quotes/preview/route.ts", load: () => import("../api/jobs/[id]/quotes/preview/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "POST", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/readiness/route.ts", load: () => import("../api/jobs/[id]/readiness/route.js"), validationCode: "INVALID_READINESS", action: "", method: "GET", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/recovery/[action]/route.ts", load: () => import("../api/jobs/[id]/recovery/[action]/route.js"), validationCode: "RECOVERY_GUARD_DENIED", action: "approve", method: "POST", mainStatus: (code: string) => 409 },
  { name: "jobs/[id]/recovery/route.ts", load: () => import("../api/jobs/[id]/recovery/route.js"), validationCode: "INVALID_COMMAND", action: "", method: "POST", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/relevance-inbox/route.ts", load: () => import("../api/jobs/[id]/relevance-inbox/route.js"), validationCode: "INVALID_INBOX", action: "", method: "GET", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/supplier-documents/route.ts", load: () => import("../api/jobs/[id]/supplier-documents/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "GET", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/things-to-check/route.ts", load: () => import("../api/jobs/[id]/things-to-check/route.js"), validationCode: "INVALID_FINDING", action: "", method: "GET", mainStatus: (code: string) => 400 },
  { name: "jobs/[id]/value/route.ts", load: () => import("../api/jobs/[id]/value/route.js"), validationCode: "DATABASE_UNAVAILABLE", action: "", method: "GET", mainStatus: (code: string) => code==="JOB_NOT_FOUND"?404:503 },
 ];

describe.each(routes)("route status compatibility: $name", ({ load, validationCode, action, method, mainStatus }) => {
  async function request(error: unknown) {
    state.error = error;
    const handlers = await load() as unknown as Record<string, (request: Request, context: { params: Promise<{ id: string; invoiceId: string; decisionId: string; action: string }> }) => Promise<Response>>;
    const handler = handlers[method]!;
    return handler(new Request("https://app.invalid/api", { method, ...(method === "POST" ? { body: JSON.stringify({ field: "STALE CONFLICT" }) } : {}), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "job", invoiceId: "invoice", decisionId: "decision", action }) });
  }
  it.each(["STALE", "CONFLICT"])("returns 400 for a field containing %s", async field => {
    const parsed = z.object({ field: z.enum(["valid"]) }).safeParse({ field }, { reportInput: true });
    if (parsed.success) throw new Error("expected schema failure");
    expect(parsed.error.message).toContain(field);
    const response = await request(parsed.error);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: validationCode });
  });
  it("keeps every business outcome byte-identical to main, including genuine 409s", async () => {
    const codes = ["STALE_REVISION", "IDEMPOTENCY_CONFLICT", "VARIATION_REVISION_CONFLICT", "CURRENT_REVISION_REQUIRED", "BASELINE_REQUIRED", "CREDIT_EXCEEDS_INVOICE", "JOB_NOT_FOUND", "JOB_NOT_LIVE", "DECISION_NOT_FOUND", "FORBIDDEN", "INVALID_COMMAND", "DATABASE_UNAVAILABLE", "NOT_FOUND", "CONFLICT", "QUOTE_CHANGED", "ALREADY_LOCKED", "SOURCE_CHANGED"];
    let conflicts = 0;
    for (const code of codes) {
      const response = await request(new Error(code));
      expect(response.status, code).toBe(mainStatus(code));
      expect(await response.text()).toBe(JSON.stringify({ code }));
      if (response.status === 409) conflicts++;
    }
    expect(conflicts).toBe(codes.filter(code => mainStatus(code) === 409).length);
  });
});
