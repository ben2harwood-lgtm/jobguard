import { expect, it, vi } from "vitest";
import { ctx, fixture } from "./fee-collection/test-fixture.js";
import { pilotApiIngress } from "./pilot-ingress.js";
import { requireProductionSettlementEligibility } from "./production-settlement-guard.js";
import { pilotWorkerTasks } from "./pilot-worker.js";

const host = "pilot-api.invalid";
const ingress = pilotApiIngress(`https://${host}`);
const dispatch = (path: string, headers: Record<string, string> = {}, method = "POST") => {
  const response = { status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  ingress({ method, path, headers: { host, ...headers } }, response, next);
  return { response, next };
};

it.each([
  ["/auth/verify", { host: "practice.invalid" }],
  ["/auth/verify", { cookie: "jg_session=fixture" }],
  ["/auth/verify", { cookie: "jobguard_session=fixture; __Host-jobguard_pilot_session=fixture" }],
  ["/auth/verify", { "stripe-signature": "fictional" }],
  ["/auth/verify", { "webhook-signature": "fictional" }],
  ["/auth/oidc/00000000-0000-4000-8000-000000000001/callback", {}],
  ["/sandbox/runs", {}],
  ["/customer-portal/signin", {}],
  ["/payments/webhook", {}],
] as const)("refuses %s at the pilot API ingress before reaching any controller", (path, headers) => {
  const { response, next } = dispatch(path, headers);
  expect(response.status).toHaveBeenCalledExactlyOnceWith(403);
  expect(next).not.toHaveBeenCalled();
});

it("lets the existing identity and health handlers enforce their own authorization", () => {
  expect(dispatch("/auth/verify").next).toHaveBeenCalledOnce();
  expect(dispatch("/healthz", {}, "GET").next).toHaveBeenCalledOnce();
});

it("rejects effect jobs copied or replayed into the pilot queue before using queue or business ports", async () => {
  const tasks = pilotWorkerTasks();
  const helpers = {} as Parameters<NonNullable<typeof tasks.final_check>>[1];
  for (const handler of Object.values(tasks)) {
    const payload = { version: "final-check-practice-run.v1", tenantId: "10000000-0000-4000-8000-000000000001" };
    await expect(handler!(payload, helpers)).rejects.toThrow("PILOT_QUEUE_EXECUTION_REFUSED");
    await expect(handler!(payload, helpers)).rejects.toThrow("PILOT_QUEUE_EXECUTION_REFUSED");
  }
});

it("refuses correctly signed synthetic payment event replays at direct execution", async () => {
  const f = fixture();
  await f.settle();
  const event = f.event();
  const before = structuredClone(f.book());
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  try {
    await expect(f.executor.webhook(ctx, "stripe_card", event.body, event.signature)).rejects.toThrow("COLLECTION_DARK");
    await expect(f.executor.webhook(ctx, "stripe_card", event.body, event.signature)).rejects.toThrow("COLLECTION_DARK");
    expect(f.book()).toEqual(before);
    expect(() => requireProductionSettlementEligibility("synthetic_demo")).toThrow("PRODUCTION_SETTLEMENT_DISABLED");
  } finally { vi.unstubAllEnvs(); }
});
