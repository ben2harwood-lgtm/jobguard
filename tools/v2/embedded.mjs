import { readFileSync } from "node:fs";
import { endianness } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "../../packages/db/node_modules/embedded-postgres/dist/index.js";
import { assertPostgresTarget, checkLocalTargets, embeddedData } from "./local-targets.mjs";
import { database, host, migrationUrl, ports } from "./settings.mjs";

export async function startEmbedded() {
  checkLocalTargets(true);
  const url = new URL(migrationUrl);
  const server = new EmbeddedPostgres({
    databaseDir: embeddedData,
    port: ports.database,
    user: url.username,
    password: url.password,
    persistent: true,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"],
    postgresFlags: ["-c", `listen_addresses=${host}`, "-c", "unix_socket_directories="],
    onLog: message => { if (/FATAL|PANIC|error:/iu.test(message)) console.error(message.trim()); },
  });
  const controlFile = join(embeddedData, "global", "pg_control");
  let control;
  try { control = readFileSync(controlFile); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    await server.initialise();
    control = readFileSync(controlFile);
  }
  // In PostgreSQL 16, ControlFileData begins with a native-endian uint64 system identifier.
  const id = (endianness() === "LE" ? control.readBigUInt64LE() : control.readBigUInt64BE()).toString();
  try { await server.start(); }
  catch { throw new Error("Could not start the dedicated V2 PostgreSQL server"); }
  const client = server.getPgClient("postgres", host);
  try {
    await client.connect();
    try {
      await assertPostgresTarget(client, id, true, "postgres");
      const { rowCount } = await client.query("SELECT FROM pg_database WHERE datname = $1", [database]);
      if (!rowCount) await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)}`);
    } finally {
      await client.end();
    }
    return { id, stop: () => server.stop() };
  } catch (error) {
    await server.stop();
    throw error;
  }
}
