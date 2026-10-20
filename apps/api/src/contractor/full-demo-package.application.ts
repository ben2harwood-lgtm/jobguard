// Practice sandbox — synthetic data; nothing is sent or charged
import type { Pool } from "pg";
import { z } from "zod";
import { BaselineError, EnterpriseDashboardError, dashboardQueryV1 } from "@jobguard/core";
import { EnterpriseDashboardApplication } from "./enterprise-dashboard.application.js";
import { BaselinePreparationHeld, baselinePrepareV1, prepareEnterpriseBaseline } from "./enterprise-baseline.application.js";

export const fullDemoPackageLabel = "Practice sandbox — synthetic data; nothing is sent or charged";
export const fullDemoPackageQueryV1 = z.object({ version: z.literal("full-demo-package-query.v1"), dashboard: dashboardQueryV1 }).strict();
const principalV1 = z.object({ sessionId: z.string().uuid() }).strict();
export const fullDemoHeldStageV1 = z.union([
  z.object({ stage: z.enum(["export", "billing", "payment"]), status: z.literal("held"), prerequisite: z.literal("ENT-6B") }).strict(),
  z.object({ stage: z.literal("statement"), status: z.literal("held"), prerequisite: z.literal("ENT-7-P") }).strict(),
]);
const held: readonly Readonly<z.infer<typeof fullDemoHeldStageV1>>[] = Object.freeze([
  Object.freeze({ stage: "export", status: "held", prerequisite: "ENT-6B" } as const),
  Object.freeze({ stage: "billing", status: "held", prerequisite: "ENT-6B" } as const),
  Object.freeze({ stage: "payment", status: "held", prerequisite: "ENT-6B" } as const),
  Object.freeze({ stage: "statement", status: "held", prerequisite: "ENT-7-P" } as const),
]);

/** Internal composition only. No route, cache, run-wide summary or alternate authority resolver. */
export class FullDemoPackageApplication {
  private readonly dashboard: EnterpriseDashboardApplication;
  constructor(pool: Pool) { this.dashboard = new EnterpriseDashboardApplication(pool); }
  async read(principal: unknown, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new EnterpriseDashboardError("MODE_FORBIDDEN");
    const actor = principalV1.safeParse(principal);
    if (!actor.success) throw new EnterpriseDashboardError("NOT_FOUND");
    const query = fullDemoPackageQueryV1.safeParse(raw);
    if (!query.success) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    // Every read delegates current session/grant checks. Never recover a refused read from cached facts.
    const value = await this.dashboard.read(actor.data, query.data.dashboard);
    return Object.freeze({ version: "full-demo-package.v1" as const, label: fullDemoPackageLabel, environment: "synthetic_demo" as const,
      observations: Object.freeze({ classification: "persisted_observation" as const, value }), held });
  }
}

export const fullDemoBaselineExampleV1 = z.object({ version: z.literal("full-demo-baseline-example.v1"), preparation: baselinePrepareV1 }).strict();
/** Separate fictional example preparation. No session, implicit live-cohort mapping or retained batch state. */
export function prepareFullDemoBaseline(raw: unknown) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new BaselinePreparationHeld();
  const parsed = fullDemoBaselineExampleV1.safeParse(raw);
  if (!parsed.success) throw new BaselineError("BASELINE_INVALID");
  const result = prepareEnterpriseBaseline("synthetic_demo", parsed.data.preparation, []);
  return Object.freeze({ version: "full-demo-baseline-example-result.v1" as const, label: fullDemoPackageLabel,
    classification: "reference_example" as const, persistence: "none" as const, historicalAuthority: "not_granted" as const,
    report: result.report,
    // The envelope labels both unchanged export formats without changing the dependency's export grammar.
    export: Object.freeze({ label: fullDemoPackageLabel, classification: "reference_example" as const, format: result.format, content: result.content }),
  });
}
