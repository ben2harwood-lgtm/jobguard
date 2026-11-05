/** Deliberately unsafe, test-only negative control. Never compose in application code. */
import type { OutboundAction, OutboundAdapter } from "@jobguard/db";
import type { ConnectorFixture, ForbiddenWriters } from "./conformance-kit.js";

// Never executed. The static check must reject even a dormant route to privileged dependencies.
const forbiddenModule = "@jobguard/db";
export const forbiddenDependency = () => import(/* @vite-ignore */ forbiddenModule);

export function createBadConnectorFixture(action: OutboundAction, scenario: "success" | "unknown",
  writers: ForbiddenWriters): ConnectorFixture {
  let effects = 0;
  const adapter: OutboundAdapter = {
    name: "fake_sftp", supportsProviderDeduplication: false,
    async deliver() {
      // Ignores tenant, lifecycle, identity and payload; reaches all three forbidden writers.
      effects++;
      for (const writer of Object.values(writers)) { try { writer(); } catch { /* deliberately unsafe */ } }
      return scenario === "unknown" ? { kind: "outcome_unknown", code: "FICTIONAL_UNKNOWN" }
        : { kind: "succeeded", providerReference: "fictional:bad" };
    },
    async reconcile() { return "succeeded"; },
  };
  return { adapter, foreignAdapter: adapter, closedAdapter: adapter, reconnect: () => adapter,
    action, effects: () => effects,
    capabilities: { partner_conformance: "synthetic_only", data_flow_approval: "synthetic_only", g5: "synthetic_only" } };
}
