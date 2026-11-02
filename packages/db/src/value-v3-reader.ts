import type { Pool } from "pg";
import { mapValueReceipt, type ValueWindowV1 } from "@jobguard/core";
import { withTenant } from "./tenant-context.js";
import { authorizePracticeJob } from "./practice-session.js";

/** Compatibility-only held ports are never executed. The installed read path
 * below uses controlled source functions, never supplied snapshots or money. */
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
/** Current practice ownership is rechecked before the controlled read. Before
 * lock the SQL function returns null without inspecting hidden data. */
export class ValueV3Reader {
 constructor(private readonly pool: Pool, private readonly sessionId?: string,
  private readonly ports: ValueProducerPortsV3 = {}) {}
 async readJob(jobId: string, window:ValueWindowV1|null=null) {
  const auth = await authorizePracticeJob(this.pool, this.sessionId, jobId);
  const snapshot = await withTenant(this.pool, auth.context, async db => {
   const locked=(await db.$client.query("SELECT id FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[auth.context.tenantId,jobId])).rows[0];
   if(!locked)return null;
   return (await db.$client.query("SELECT app.read_value_job($1,$2) result",[jobId,auth.digest])).rows[0]?.result;
  });
  if (snapshot) return { version: "job-value.v3" as const, environment: "synthetic_demo" as const, jobId,
   status: "mapped" as const, receipt: mapValueReceipt(snapshot,window) };
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
