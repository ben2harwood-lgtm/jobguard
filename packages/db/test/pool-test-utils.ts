import { createServer } from "node:net";
import type { Pool } from "pg";

const canListen = (host: string, port: number) => new Promise<boolean>(resolve => {
  const server = createServer();
  // A host with no IPv6 loopback cannot bind ::1 at all, which is not a conflict.
  server.once("error", (error: NodeJS.ErrnoException) => resolve(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT"));
  server.listen({ host, port }, () => server.close(() => resolve(true)));
});
/**
 * A port in [base, base + span) that nothing is listening on, on IPv4 and IPv6 loopback, right now. Embedded clusters used to take a
 * random port blindly; tools on a shared machine (a Lima VM forwards 59315 and 59316) sit inside those ranges, and a cluster that
 * cannot bind 127.0.0.1 still reports "ready" while the test connects to whatever owns the port.
 */
export async function freePort(base: number, span: number): Promise<number> {
  for (let attempt = 0; attempt < Math.max(50, span * 2); attempt++) {
    const port = base + Math.floor(Math.random() * span);
    if (await canListen("127.0.0.1", port) && await canListen("::1", port)) return port;
  }
  throw new Error(`no free port in ${base}..${base + span}`);
}

/**
 * Close test pools and let their socket shutdown events drain before terminating
 * an embedded Postgres process. node-postgres can resolve `Pool.end()` before
 * the final socket event has passed through the event loop; stopping Postgres
 * in that window reports a spurious FATAL 57P01 to Vitest.
 */
export async function closeTestPools(...pools: Array<Pool | undefined>): Promise<void> {
  await Promise.all(pools.map(async (pool) => pool?.end()));
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
}

/** Earlier suites exercise other contracts with generated jobs. Supply CH-3a's
 * explicit fictional party recipe as fixture setup, before their live/document
 * commands. CH-3a's own missing-details tests never install this trigger. */
export async function installLegacySyntheticPartyFixtures(admin: Pool): Promise<void> {
  await admin.query(`CREATE OR REPLACE FUNCTION app.test_fixture_job_parties() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  DECLARE c uuid:=gen_random_uuid();cr uuid:=gen_random_uuid();s uuid:=gen_random_uuid();sr uuid:=gen_random_uuid();b uuid:=gen_random_uuid();BEGIN
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true); END IF;
   INSERT INTO app.customer(tenant_id,id) VALUES(NEW.tenant_id,c);
   INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES(NEW.tenant_id,cr,c,1,'{"version":"customer.v1","name":"Practice Customer","type":"person","email":"practice-customer@example.invalid"}');
   INSERT INTO app.site(tenant_id,id) VALUES(NEW.tenant_id,s);
   INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES(NEW.tenant_id,sr,s,1,'{"version":"site.v1","addressLines":["14 Fictional Street"],"town":"London","postcode":"SW1A 1AA"}','[]');
   INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
   VALUES(NEW.tenant_id,b,NEW.id,coalesce(NEW.revision,0),c,cr,c,cr,s,sr,'backfilled_synthetic_fixture');
   INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES(NEW.tenant_id,NEW.id,b);
   RETURN NEW;
  END $$;
  CREATE TRIGGER aaa_explicit_test_fixture BEFORE INSERT ON app.job FOR EACH ROW EXECUTE FUNCTION app.test_fixture_job_parties();
  CREATE OR REPLACE FUNCTION app.test_fixture_document_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true); END IF;
   RETURN NEW;
  END $$;
  CREATE TRIGGER aaa_explicit_quote_fixture BEFORE INSERT ON app.quote_document_version FOR EACH ROW EXECUTE FUNCTION app.test_fixture_document_context();
  CREATE TRIGGER aaa_explicit_invoice_fixture BEFORE INSERT ON app.customer_invoice FOR EACH ROW EXECUTE FUNCTION app.test_fixture_document_context();`);
}
