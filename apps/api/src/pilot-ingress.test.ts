import { expect, it, vi } from "vitest";
import { ctx, fixture } from "./fee-collection/test-fixture.js";
import { pilotApiIngress } from "./pilot-ingress.js";
import { requireProductionSettlementEligibility } from "./production-settlement-guard.js";
import { pilotWorkerTasks } from "./pilot-worker.js";
import { pilotApprovalFixture } from "@jobguard/config/test/pilot-approval";

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
  ["/auth/verify", { cookie: "__Host-jobguard_pilot_customer=fixture" }],
  ["/jobs", { cookie: "__Host-jobguard_pilot_customer=fixture" }],
  ["/customer-portal/signin", { host: "practice.invalid" }],
  ["/customer-portal/signin", { cookie: "jg_session=fixture" }],
  ["/customer-portal/signin", { cookie: "jobguard_customer=fixture; __Host-jobguard_pilot_customer=fixture" }],
  ["/customer-portal/signin", { "stripe-signature": "fictional" }],
  ["/customer-portal/signin", { "webhook-signature": "fictional" }],
  ["/customer-portal/unlisted", {}],
  ["/payments/webhook", {}],
] as const)("refuses %s at the pilot API ingress before reaching any controller", (path, headers) => {
  for (const [name, value] of Object.entries(pilotApprovalFixture().env)) vi.stubEnv(name, value);
  try {
    const { response, next } = dispatch(path, headers);
    expect(response.status).toHaveBeenCalledExactlyOnceWith(403);
    expect(next).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});

it("delegates exact portal POSTs only with G1 open", () => {
  for (const [name, value] of Object.entries(pilotApprovalFixture().env)) vi.stubEnv(name, value);
  try {
    expect(dispatch("/customer-portal/signin").next).toHaveBeenCalledOnce();
    expect(dispatch("/customer-portal/read", { cookie: "__Host-jobguard_pilot_customer=fixture" }).next).toHaveBeenCalledOnce();
    expect(dispatch("/customer-portal/read", {}, "GET").response.status).toHaveBeenCalledExactlyOnceWith(403);
    vi.stubEnv("JOBGUARD_PILOT_21_APPROVAL", undefined);
    for (const path of ["/customer-portal/signin", "/customer-portal/read", "/customer-portal/quote-accept"]) {
      const { response, next } = dispatch(path);
      expect(response.status).toHaveBeenCalledExactlyOnceWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  } finally { vi.unstubAllEnvs(); }
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

it("only passes valid Final Check identifiers to the installed pilot executor", async () => {
  const execute = vi.fn(async () => {});
  const tasks = pilotWorkerTasks(execute);
  const helpers = {} as Parameters<NonNullable<typeof tasks.final_check>>[1];
  const task = { version: "final-check-task.v1", tenantId: "10000000-0000-4000-8000-000000000001",
    jobId: "10000000-0000-4000-8000-000000000002", lockId: "10000000-0000-4000-8000-000000000003",
    manifestId: "10000000-0000-4000-8000-000000000004", executionId: "10000000-0000-4000-8000-000000000005" };
  for (const [name, handler] of Object.entries(tasks)) {
    if (name === "final_check") continue;
    await expect(handler!(task, helpers)).rejects.toThrow("PILOT_QUEUE_EXECUTION_REFUSED");
  }
  await expect(tasks.final_check!({ ...task, version: "final-check-practice-run.v1" }, helpers)).rejects.toThrow("INVALID_FINAL_CHECK_TASK");
  await expect(tasks.final_check!({ ...task, completed: true }, helpers)).rejects.toThrow("INVALID_FINAL_CHECK_TASK");
  expect(execute).not.toHaveBeenCalled();
  await tasks.final_check!(task, helpers);
  expect(execute).toHaveBeenCalledExactlyOnceWith(task);
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
