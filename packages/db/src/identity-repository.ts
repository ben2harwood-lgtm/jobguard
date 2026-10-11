import type { Pool, PoolClient } from "pg";

export interface IdentityChallenge {
  id: string; email: string; purpose: string; invitation_id: string | null;
  digest: string; expires_at: Date; requested_at: Date; attempts: number; consumed_at: Date | null;
}
export interface IdentityMembership {
  id: string; identity_user_id: string; tenant_id: string; role: string; email: string; name: string;
}
/** Separate identity credentials only. No business runtime or worker credential is accepted by composition. */
export class IdentityRepository {
  constructor(readonly pool: Pool) {}
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async lock(client: PoolClient, email: string, ipDigest?: string): Promise<void> {
    // Fixed order across replicas: IP rate window, then normalized email (all purposes).
    if (ipDigest) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`identity-ip:${ipDigest}`]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`identity-email:${email}`]);
  }
  async latest(client: PoolClient, email: string, purpose: string): Promise<IdentityChallenge | undefined> {
    return (await client.query<IdentityChallenge>("SELECT * FROM identity.challenge WHERE email=$1 AND purpose=$2 ORDER BY requested_at DESC,id DESC LIMIT 1 FOR UPDATE", [email, purpose])).rows[0];
  }
  async memberships(userId: string): Promise<IdentityMembership[]> {
    return (await this.pool.query<IdentityMembership>("SELECT * FROM identity.current_memberships($1)", [userId])).rows;
  }
}
