import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { createSecureContext } from "node:tls";
import { X509Certificate } from "node:crypto";
import { parseEnv } from "node:util";

const demoIdentifiers = JSON.parse(readFileSync(new URL("./demo-identifiers.json", import.meta.url), "utf8"));
export const host = "127.0.0.1";
export const ports = Object.freeze({ database: 56432, storage: 16900, api: 3401, web: 3400 });
export const database = "jobguard_v2_local";
export const bucket = "jobguard-v2-evidence";
export const postgresData = "/var/lib/postgresql/data/pgdata-v2";
const postgresUrl = (login, password) => `postgresql://${login}:${password}@${host}:${ports.database}/${database}`;
export const migrationUrl = postgresUrl("jobguard_v2_admin", "v2-local-admin-only");
const runtimeUrl = postgresUrl("jobguard_runtime", "v2-local-runtime-only");

const defaults = Object.freeze({
  DATABASE_URL: runtimeUrl,
  MIGRATION_DATABASE_URL: migrationUrl,
  RUNTIME_DATABASE_URL: runtimeUrl,
  IDENTITY_DATABASE_URL: postgresUrl("jobguard_identity", "v2-local-identity-only"),
  WORKER_DATABASE_URL: postgresUrl("jobguard_v2_actions", "v2-local-actions-only"),
  GRAPHILE_DATABASE_URL: postgresUrl("jobguard_v2_queue", "v2-local-queue-only"),
  SHADOW_DATABASE_URL: postgresUrl("jobguard_v2_shadow", "v2-local-shadow-only"),
  S3_ENDPOINT: `http://${host}:${ports.storage}`,
  S3_BUCKET: bucket,
  S3_ACCESS_KEY_ID: "jobguard-v2-local",
  S3_SECRET_ACCESS_KEY: "v2-local-storage-only",
  S3_REGION: "eu-west-2",
  API_PORT: String(ports.api),
  NEXT_PUBLIC_API_URL: `http://${host}:${ports.api}`,
  JOBGUARD_ENV: "synthetic_demo", // Existing feature mode. The database, logins and data are V2's.
  NEXT_TELEMETRY_DISABLED: "1",
});

const endpointKey = /(?:^|_)(?:URLS?|URIS?|ENDPOINTS?|DSN|ORIGINS?|HOSTS?|PROXIES|PROXY|BUCKET|HOSTING)(?:_|$)/iu;
const targetOverride = /^(?:V2_|COMPOSE_|PG(?:HOST|PORT|DATABASE|DATA|SERVICE|OPTIONS))|(?:^|_)(?:STORAGE|S3|DATABASE|POSTGRES)(?:_.*)?_(?:DIR(?:ECTORY)?|PATH|VOLUME|PORT|NAME|DATA)$/iu;
const uri = /(?:[a-z][a-z0-9+.-]*:\/\/|(?:^|\s)\/\/)/iu;

function phoneSettings(env, interfaces) {
  const address = env.JOBGUARD_V2_PHONE_HOST;
  const certFile = env.JOBGUARD_V2_PHONE_CERT;
  const keyFile = env.JOBGUARD_V2_PHONE_KEY;
  if (!address && !certFile && !keyFile) return undefined;
  const privateV4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u;
  if (!address || !privateV4.test(address) || !Object.values(interfaces).flat().some(entry =>
    entry.address === address && entry.family === "IPv4" && !entry.internal)) {
    throw new Error("JOBGUARD_V2_PHONE_HOST must be a private IPv4 address assigned to this computer");
  }
  if (!certFile || !keyFile) throw new Error("V2 phone access requires a local TLS certificate and key");
  const cert = readFileSync(certFile);
  const key = readFileSync(keyFile);
  const certificate = new X509Certificate(cert);
  if (certificate.checkIP(address) !== address || Date.now() < Date.parse(certificate.validFrom) ||
      Date.now() > Date.parse(certificate.validTo)) {
    throw new Error("V2 phone certificate must be current and name the private address");
  }
  createSecureContext({ cert, key });
  return { address, certFile: resolve(certFile), keyFile: resolve(keyFile) };
}

export function validateSettings(env, interfaces = networkInterfaces()) {
  // Reject demo identifiers wherever they occur, including encoded URLs and mixed case.
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch { /* malformed URLs fail the exact check below */ }
    if (demoIdentifiers.some(identifier => decoded.toLowerCase().includes(identifier))) {
      throw new Error(`${name} contains a blocked demo identifier`);
    }
  }
  const phone = phoneSettings(env, interfaces);
  const webOrigin = phone ? `https://${phone.address}:${ports.web}` : `http://${host}:${ports.web}`;
  const settings = { ...defaults, AUTH_ALLOWED_ORIGIN: webOrigin, JOBGUARD_ALLOWED_ORIGINS: webOrigin };
  for (const [name, value] of Object.entries(env)) {
    if (!value || ["JOBGUARD_V2_PHONE_HOST", "NO_PROXY", "no_proxy", "__CFBundleIdentifier"].includes(name)) continue;
    if (Object.hasOwn(settings, name)) {
      if (value !== settings[name]) throw new Error(`${name} must match the V2 local settings`);
    } else if (endpointKey.test(name) || targetOverride.test(name) || uri.test(value)) {
      throw new Error(`${name} is outside the V2 endpoint allowlist`);
    }
  }
  return { settings, phone };
}

export function refuseDotenvFiles(root) {
  for (const directory of ["", "apps/web", "apps/api"]) {
    for (const filename of [".env", ".env.local", ".env.development", ".env.development.local",
      ".env.production", ".env.production.local"]) {
      const path = resolve(root, directory, filename);
      if (!existsSync(path)) continue;
      // Print a setting name, never its value, for overrides with forbidden targets.
      validateSettings(parseEnv(readFileSync(path, "utf8")));
      throw new Error(`V2 requires a clean worktree without ${directory ? `${directory}/` : ""}${filename}`);
    }
  }
}
