import type { Pool } from "pg";
import { emptyMobileAuthStateV1, mobileAuthStateV1, type MobileAuthStateV1, type SyntheticMobileAuthStore } from "@jobguard/core";

/** Restricted identity pool only. Deliberately coarse snapshot lock for the unregistered synthetic seam.
 * No bearer credentials enter this store. It is not the production mobile identity design.
 */
export class PostgresSyntheticMobileAuthStore implements SyntheticMobileAuthStore {
 readonly #pool: Pool;
 constructor(pool: Pool) { this.#pool = pool; }
 async transaction<T>(work: (state: MobileAuthStateV1) => Promise<{ state: MobileAuthStateV1; result: T }>): Promise<T> {
  const client = await this.#pool.connect();
  try {
   await client.query("BEGIN");
   await client.query("INSERT INTO identity.mobile_auth_fixture_state(environment,state) VALUES('synthetic_demo',$1) ON CONFLICT DO NOTHING", [JSON.stringify(emptyMobileAuthStateV1())]);
   const row = (await client.query("SELECT state FROM identity.mobile_auth_fixture_state WHERE environment='synthetic_demo' FOR UPDATE")).rows[0];
   const state = mobileAuthStateV1.safeParse(row?.state);
   if (!state.success) throw new Error("MOBILE_STORE_INVALID_STATE");
   const next = await work(state.data);
   const parsed = mobileAuthStateV1.safeParse(next.state);
   if (!parsed.success) throw new Error("MOBILE_STORE_INVALID_STATE");
   await client.query("UPDATE identity.mobile_auth_fixture_state SET state=$1 WHERE environment='synthetic_demo'", [JSON.stringify(parsed.data)]);
   await client.query("COMMIT");
   return next.result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
 }
}
