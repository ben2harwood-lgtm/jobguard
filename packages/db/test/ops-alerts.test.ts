import { workerProtocolFixture } from "../src/worker-protocol-test-fixture.js";
import { outboundWorkerPool } from "../src/worker-pool.js";
vi.mock("../src/worker-pool.js", () => ({ outboundWorkerPool: vi.fn() }));
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { FakeOpsSink } from "../../config/src/ops-alerts.js";
import { ActionExecutor, type OutboundAdapter } from "../src/outbox.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const catalogue = JSON.parse(readFileSync(new URL("../../../config/ops-alerts.v1.json", import.meta.url), "utf8"));
it.each(["retryable", "outcome_unknown"] as const)("actual outbox %s failure reaches the fake sink", async kind => {
  const sink = new FakeOpsSink(catalogue);
  const id = "98000000-0000-4000-8000-000000000001";
  const tenant = "91000000-0000-4000-8000-000000000001";
  const f = workerProtocolFixture({ id, tenant_id: tenant });
  f.state.attempt = 4;
  vi.mocked(outboundWorkerPool).mockResolvedValue(f.pool);
  const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false,
    deliver: vi.fn(async () => ({ kind, code: "FICTIONAL_FAILURE" })), reconcile: vi.fn() };
  await new ActionExecutor(f.pool, new Map([[adapter.name, adapter]]), sink.outboxTelemetry()).execute(testTenantContext(tenant), id);
  expect(adapter.deliver).toHaveBeenCalledOnce();
  expect(sink.records.map(record => record.id)).toEqual([kind === "retryable" ? "queue_failure" : "unknown_send"]);
});
