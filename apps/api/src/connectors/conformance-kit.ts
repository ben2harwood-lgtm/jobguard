/** Test-only ENT-13b kit. Never registered with a worker, HTTP route or provider. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import type { OutboundAction, OutboundAdapter } from "@jobguard/db";

export const connectorCapabilities = ["work_orders", "billing_status", "materials_issues", "export_delivery",
  "durable_restart", "partner_conformance", "data_flow_approval", "g5"] as const;
type Capability = typeof connectorCapabilities[number];
type Availability = "synthetic_only" | "unavailable";
export function capabilityReport(declared: Partial<Record<Capability, Availability>>) {
  return Object.fromEntries(connectorCapabilities.map(key => [key, declared[key] ?? "unavailable"])) as Record<Capability, Availability>;
}
export type ForbiddenWriters = Record<"origin" | "approval" | "fee", () => void>;
export interface ConnectorFixture {
  adapter: OutboundAdapter;
  foreignAdapter: OutboundAdapter;
  closedAdapter: OutboundAdapter;
  reconnect(): OutboundAdapter;
  action: OutboundAction;
  effects(): number;
  capabilities: Partial<Record<Capability, Availability>>;
}
export interface ConnectorUnderTest {
  sourceEntry: string;
  create(scenario: "success" | "unknown", writers: ForbiddenWriters): ConnectorFixture;
}

/** Fail closed on runtime imports outside pure contracts, including transitive local imports.
 * This checks the actual source graph, not an adapter-supplied source string. It is a deterministic
 * boundary check, not a sandbox or proof against arbitrary malicious JavaScript.
 */
export function assertConnectorSourceBoundary(entry: string): void {
  const visited = new Set<string>();
  function inspect(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function dependency(specifier: string) {
      if (["zod", "@jobguard/core", "@jobguard/config"].includes(specifier)) return;
      assert.ok(specifier.startsWith("."), `Forbidden runtime dependency: ${specifier}`);
      inspect(resolve(dirname(file), specifier.replace(/\.js$/u, ".ts")));
    }
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const typeOnly = clause?.isTypeOnly || (clause && !clause.name && clause.namedBindings &&
          ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 &&
          clause.namedBindings.elements.every(element => element.isTypeOnly));
        if (!typeOnly) dependency((node.moduleSpecifier as ts.StringLiteral).text);
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
        dependency((node.moduleSpecifier as ts.StringLiteral).text);
      }
      if (ts.isImportEqualsDeclaration(node) || (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && ["require", "eval", "Function"].includes(node.expression.text)))) ||
        (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function")) {
        assert.fail("Dynamic code or dependency loading is outside the connector boundary");
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  inspect(resolve(entry));
}

export const conformanceChecks = ["tenant_binding", "one_effect", "payload_conflict", "unknown_no_resend",
  "non_live_refusal", "capability_report", "static_writer_boundary", "runtime_writer_boundary"] as const;
type Check = typeof conformanceChecks[number];
export type ConformanceResult = { check: Check; passed: boolean };

/** Every check uses fresh state and continues after failure so a broken fake must fail each one.
 * Fixture effects must observe the fake provider, not just count calls to this wrapper.
 */
export async function runConnectorConformance(candidate: ConnectorUnderTest): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];
  for (const check of conformanceChecks) {
    let writerCalls = 0;
    const forbidden = () => { writerCalls++; throw new Error("Forbidden writer reached"); };
    try {
      const f = candidate.create(check === "unknown_no_resend" ? "unknown" : "success",
        { origin: forbidden, approval: forbidden, fee: forbidden });
      if (check === "tenant_binding") {
        await assert.rejects(() => f.foreignAdapter.deliver(f.action));
        assert.equal(await f.foreignAdapter.reconcile(f.action.providerEffectKey), "unknown");
        assert.equal(f.effects(), 0);
        await f.adapter.deliver(f.action);
        await assert.rejects(() => f.foreignAdapter.deliver(f.action));
        assert.equal(await f.foreignAdapter.reconcile(f.action.providerEffectKey), "unknown");
        assert.equal(f.effects(), 1);
      } else if (check === "one_effect") {
        const first = await f.adapter.deliver(f.action);
        assert.equal(first.kind, "succeeded");
        assert.deepEqual(await f.reconnect().deliver(f.action), first);
        assert.equal(f.effects(), 1);
      } else if (check === "payload_conflict") {
        const first = await f.adapter.deliver(f.action);
        await assert.rejects(() => f.adapter.deliver({ ...f.action, recipient: "changed.invalid" }));
        assert.deepEqual(await f.adapter.deliver(f.action), first);
        assert.equal(f.effects(), 1);
      } else if (check === "unknown_no_resend") {
        assert.equal((await f.adapter.deliver(f.action)).kind, "outcome_unknown");
        const effects = f.effects();
        const restarted = f.reconnect();
        assert.equal((await restarted.deliver(f.action)).kind, "outcome_unknown");
        assert.equal(f.effects(), effects);
        const outcome = await restarted.reconcile(f.action.providerEffectKey);
        assert.ok(["succeeded", "unknown", "not_found"].includes(outcome));
        assert.equal(f.effects(), effects);
      } else if (check === "non_live_refusal") {
        await assert.rejects(() => f.closedAdapter.deliver(f.action));
        assert.equal(f.effects(), 0);
        await f.adapter.deliver(f.action);
        await assert.rejects(() => f.closedAdapter.deliver(f.action));
        assert.equal(f.effects(), 1);
      } else if (check === "capability_report") {
        const report = capabilityReport(f.capabilities);
        for (const key of connectorCapabilities) {
          assert.ok(["synthetic_only", "unavailable"].includes(report[key]));
          if (!(key in f.capabilities)) assert.equal(report[key], "unavailable");
        }
        // These fixtures cannot supply human, partner or release evidence.
        for (const key of ["partner_conformance", "data_flow_approval", "g5"] as const) {
          assert.equal(report[key], "unavailable");
        }
      } else if (check === "static_writer_boundary") {
        assertConnectorSourceBoundary(candidate.sourceEntry);
      } else {
        await f.adapter.deliver(f.action);
        await f.adapter.reconcile(f.action.providerEffectKey);
        assert.equal(writerCalls, 0);
        // No writer surface may be exposed by the adapter itself.
        assert.deepEqual(Object.keys(f.adapter).sort(),
          ["deliver", "name", "reconcile", "supportsProviderDeduplication"].sort());
      }
      results.push({ check, passed: true });
    } catch {
      results.push({ check, passed: false });
    }
  }
  return results;
}
