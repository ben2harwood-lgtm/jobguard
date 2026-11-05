import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { renderBillingExport } from "@jobguard/core";
import type { OutboundAction } from "@jobguard/db";
import { createInMemorySftpServer } from "./sftp.synthetic.js";
import { capabilityReport, connectorCapabilities, conformanceChecks, runConnectorConformance } from "./conformance-kit.js";
import type { ConnectorUnderTest } from "./conformance-kit.js";
import { createBadConnectorFixture } from "./conformance-kit.bad-fixture.js";

const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const environment = { CONNECTOR_CONFIG_VERSION: "connector-environment.v1", JOBGUARD_ENV: "synthetic_demo",
  CONNECTOR_ENDPOINT_KIND: "fake", CONNECTOR_ENDPOINT_REF: "fixture:server", CONNECTOR_CREDENTIAL_REF: "fixture:key1" };
const scope = { version: "sftp-fixture-scope.v1", tenantId: id(1), clientContractId: id(2),
  operations: ["work_orders", "billing_status", "materials_issues", "export_delivery"], maxBytes: 100000 };
function action(): OutboundAction {
  const artifact = renderBillingExport({ version: "billing-export.v1", clientContractId: id(2), lines: [{
    jobId: id(3), extraId: id(4), scopeItemId: id(5), revisionId: id(6), revisionHash: "a".repeat(64),
    approvalBindingId: id(7), approvalSnapshotHash: "b".repeat(64), description: "Fictional item", quantity: "1",
    unit: "item", priceProvenance: "server_sor", approvedNet: { pence: 12000, currency: "GBP" },
  }] });
  return { version: "outbound-action.v1", id: id(8), authorizationId: id(9), adapter: "fake_sftp",
    providerEffectKey: "fixture:effect", actionType: "billing_export", recipient: "fictional.invalid",
    immutableContent: artifact.json, contentHash: artifact.jsonHash, aggregateRevision: 1, amountPence: 12000,
    currency: "GBP", policyVersion: "fixture.v1", authorizationExpiresAt: new Date("2026-12-01T00:00:00Z") };
}

const synthetic: ConnectorUnderTest = {
  sourceEntry: fileURLToPath(new URL("./sftp.synthetic.ts", import.meta.url)),
  create(scenario) {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]]));
    const connect = () => server.connect(environment, scope, scenario === "unknown" ? "unknown_accepted" : "success").adapter;
    return { adapter: connect(), reconnect: connect, action: action(),
      foreignAdapter: server.connect(environment, { ...scope, tenantId: id(99) }).adapter,
      closedAdapter: server.connect(environment, { ...scope, jobLive: false }).adapter,
      capabilities: server.connect(environment, scope).capabilities,
      effects: () => server.simulatedEffects };
  },
};
const bad: ConnectorUnderTest = {
  sourceEntry: fileURLToPath(new URL("./conformance-kit.bad-fixture.ts", import.meta.url)),
  create: (scenario, writers) => createBadConnectorFixture(action(), scenario, writers),
};

describe("ENT-13b shared synthetic conformance (no provider or release evidence)", () => {
  it("passes every named check for the synthetic SFTP connector", async () => {
    expect(await runConnectorConformance(synthetic)).toEqual(conformanceChecks.map(check => ({ check, passed: true })));
  });
  it("fails every named check for the deliberately bad connector", async () => {
    expect(await runConnectorConformance(bad)).toEqual(conformanceChecks.map(check => ({ check, passed: false })));
  });
  it("records every missing capability as unavailable", () => {
    expect(Object.values(capabilityReport({}))).toEqual(connectorCapabilities.map(() => "unavailable"));
    expect(capabilityReport({ export_delivery: "synthetic_only" })).toMatchObject({
      export_delivery: "synthetic_only", work_orders: "unavailable", durable_restart: "unavailable",
      partner_conformance: "unavailable", data_flow_approval: "unavailable", g5: "unavailable",
    });
  });
});
