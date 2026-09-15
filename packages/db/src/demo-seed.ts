import { createHash } from "node:crypto";
import { money, type Money } from "@jobguard/core";

export const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_JOB_ID = "d1500000-0000-4000-8000-000000000150";
export const DEMO_SCOPE_ITEM_ID = "d1500000-0000-4000-8000-000000001500";
export const DEMO_IDENTITY_USER_ID = "d1500000-0000-4000-8000-000000000001";
export const DEMO_ACCOUNT_ID = "d1500000-0000-4000-8000-000000000002";
export const DEMO_MEMBERSHIP_ID = "d1500000-0000-4000-8000-000000000003";
export const DEMO_EMPTY_TENANT_ID = "33333333-3333-4333-8333-333333333333";
export const DEMO_EMPTY_ACCOUNT_ID = "33333333-3333-4333-8333-333333333334";
export const DEMO_EMPTY_MEMBERSHIP_ID = "33333333-3333-4333-8333-333333333335";
export const DEMO_SEED_VERSION = "m1-15.demo-seed.v1";

export type DemoEnvironment = "synthetic_demo" | "pilot_no_charge" | "production";
export type DemoSeedCommand = Readonly<{
  version: "demo-seed-command.v1";
  commandId: string;
  semanticKey: string;
  tenantId: typeof DEMO_TENANT_ID;
  jobId: typeof DEMO_JOB_ID;
  scopeItemId: typeof DEMO_SCOPE_ITEM_ID;
  checkpoint: DemoCheckpoint;
  amount: Money | null;
}>;

export const demoCheckpoints = [
  "capture", "review_confirm", "quote_sent", "accepted", "live", "decision",
  "verified_proof", "approved_extra", "final_account", "issued_invoice",
  "recorded_payment", "fee_illustration",
] as const;
export type DemoCheckpoint = (typeof demoCheckpoints)[number];

export class DemoSeedSafetyError extends Error {
  readonly code = "DEMO_SEED_ENVIRONMENT_FORBIDDEN";
}

export interface DemoCommandBoundary {
  execute(command: DemoSeedCommand): Promise<"created" | "replayed">;
}

const uuidFor = (checkpoint: DemoCheckpoint) => {
  const value = createHash("sha256").update(`${DEMO_SEED_VERSION}:${checkpoint}`).digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
};

/** Builds only deterministic, synthetic command envelopes; the supplied boundary owns every write. */
export async function seedDemo(environment: DemoEnvironment, boundary: DemoCommandBoundary) {
  if (environment !== "synthetic_demo") {
    throw new DemoSeedSafetyError(`Refusing demo seed in ${environment}; synthetic_demo is required.`);
  }
  const outcomes: Array<{ checkpoint: DemoCheckpoint; result: "created" | "replayed" }> = [];
  for (const checkpoint of demoCheckpoints) {
    const amount: Money | null = checkpoint === "recorded_payment"
      ? money(150000)
      : checkpoint === "fee_illustration" ? money(7900) : null;
    const command: DemoSeedCommand = {
      version: "demo-seed-command.v1", commandId: uuidFor(checkpoint),
      semanticKey: `${DEMO_SEED_VERSION}:${checkpoint}`, tenantId: DEMO_TENANT_ID,
      jobId: DEMO_JOB_ID, scopeItemId: DEMO_SCOPE_ITEM_ID, checkpoint, amount,
    };
    outcomes.push({ checkpoint, result: await boundary.execute(command) });
  }
  return outcomes;
}
