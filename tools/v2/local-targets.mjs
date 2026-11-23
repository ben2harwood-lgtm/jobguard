import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { database, host, ports, postgresData } from "./settings.mjs";

const checkout = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
export const state = join(checkout, ".jobguard", "v2");
export const embeddedData = join(state, "postgres");
export const storageData = join(state, "objects");

export function checkDirectory(path, create = false) {
  try {
    const info = lstatSync(path);
    if (!info.isDirectory() || realpathSync(path) !== path || info.uid !== process.getuid() || (info.mode & 0o077)) {
      throw new Error(`V2 requires a private directory at ${path}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (create) {
      mkdirSync(path, { mode: 0o700 });
      checkDirectory(path);
    }
  }
}

export function checkLocalTargets(create = false) {
  for (const path of [dirname(state), state, embeddedData, storageData]) checkDirectory(path);
  if (create) for (const path of [dirname(state), state, storageData]) checkDirectory(path, true);
}

export function authSecret() {
  const directory = dirname(state);
  checkDirectory(directory, true);
  const path = join(directory, "v2-auth-secret");
  try { writeFileSync(path, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const info = lstatSync(path);
  if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error("Invalid V2 sign-in secret file");
  const secret = readFileSync(path, "utf8");
  if (!/^[a-f0-9]{64}$/u.test(secret)) throw new Error("Invalid V2 sign-in secret file");
  return secret;
}

export async function assertPostgresTarget(client, expectedId, embedded, name = database) {
  const { rows: [target] } = await client.query(`SELECT current_database() AS name,
    current_setting('data_directory') AS directory, inet_server_port() AS port,
    host(inet_server_addr()) AS address, system_identifier::text AS id FROM pg_control_system()`);
  if (target?.name !== name || target.directory !== (embedded ? embeddedData : postgresData) ||
      target.port !== (embedded ? ports.database : 5432) || target.id !== expectedId ||
      (embedded && target.address !== host)) {
    throw new Error("V2 PostgreSQL server identity does not match");
  }
}
