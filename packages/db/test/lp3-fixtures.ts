import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { migrate } from "../src/migrate.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

// Main's actual signatures win over the draft's extra UUID in both quote rows.
export const lp3OldSignatures = [
  "app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,character varying,character varying,character varying,uuid,timestamp with time zone)",
  "app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone)",
  "app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid)",
  "app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone)",
] as const;
export const lp3NewSignatures = lp3OldSignatures.map((signature, index) =>
  signature.slice(0, -1) + (index === 1 ? ",uuid" : "") + ",uuid,uuid,jsonb)");

/** Owner setup and a real inherited runtime login; no runtime fixture writes. */
export async function lp3CatalogDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "lp3-pg-"));
  const port = await freePort(58000, 200);
  const credential = randomUUID();
  const pg = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres",
    password: credential, persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  let bootstrap: Pool | undefined, owner: Pool | undefined, runtime: Pool | undefined;
  try {
    await pg.initialise();
    await pg.start();
    const connection = { host: "127.0.0.1", port, user: "postgres", password: credential };
    bootstrap = new Pool({ ...connection, database: "postgres" });
    await bootstrap.query("CREATE DATABASE jobguard_synthetic_demo");
    owner = new Pool({ ...connection, database: "jobguard_synthetic_demo" });
    await migrate(owner);
    // A separate login exercises inherited and PUBLIC privileges, never SET ROLE owner.
    await owner.query("CREATE ROLE lp3_login LOGIN NOSUPERUSER NOBYPASSRLS INHERIT");
    await owner.query("GRANT jobguard_runtime TO lp3_login");
    runtime = new Pool({ host: connection.host, port, user: "lp3_login", database: "jobguard_synthetic_demo", max: 2 });
    const captured = { owner, runtime };
    return { ...captured, async close() {
      await closeTestPools(runtime, owner, bootstrap);
      await pg.stop();
    } };
  } catch (error) {
    await closeTestPools(runtime, owner, bootstrap);
    await pg.stop();
    throw error;
  }
}
