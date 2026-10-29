import type { Pool } from "pg";
import { authorizePracticeJob } from "./practice-session.js";

/** Producer ports only. These names describe required handoffs, not installed
 * producer contracts. A held adapter must never be called, even in demo mode.
 * SV-6 owns cumulative derivation and M4-8 owns allocations; MON-1 owns period
 * semantics. No local SQL, rounding, deduplication or timestamp policy substitutes. */
export interface HeldValueProducerPortV3 {
 readonly binding: "HELD";
 readonly reason: "H-VALUE-SOURCES" | "H-MON-1" | "H-M4-MONEY";
 readAuthorisedSnapshot(): Promise<unknown>;
}
export interface ValueProducerPortsV3 {
 readonly sources?: HeldValueProducerPortV3;
 readonly derivation?: HeldValueProducerPortV3;
 readonly subscription?: HeldValueProducerPortV3;
 readonly postedMoney?: HeldValueProducerPortV3;
}
/** No business persistence or source queries until accepted producer handoff.
 * Recheck the real per-session owner even when invoked outside the application.
 * Ownership's audit ancestry read is the existing authorised import mechanism;
 * this reader adds no audit write, shadow query, count or existence probe. */
export class ValueV3Reader {
 constructor(private readonly pool: Pool, private readonly sessionId?: string,
  private readonly ports: ValueProducerPortsV3 = {}) {}
 async readJob(jobId: string) {
  await authorizePracticeJob(this.pool, this.sessionId, jobId);
  // Retain ports for future composition, but never execute a held producer.
  void this.ports;
  return {
   version: "job-value.v3" as const, environment: "synthetic_demo" as const, jobId,
   status: "incomplete" as const, reason: "producer_bindings_held" as const,
   producers: { sources: "HELD" as const, derivation: "HELD" as const,
    subscription: "HELD" as const, postedMoney: "HELD" as const },
   asOf: null, receipt: null,
  };
 }
}
