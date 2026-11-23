import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { bucket, database, host, migrationUrl, ports, postgresData, refuseDotenvFiles, validatePhoneCertificate, validateSettings } from "./settings.mjs";

import { authSecret, checkDirectory, checkLocalTargets, state, storageData } from "./local-targets.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);

function hostEnvironment(keys) {
  return Object.fromEntries(keys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
}

function run(command, args, env, capture = false) {
  const result = spawnSync(command, args, { env, encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.signal ?? result.status}`);
  return result.stdout?.trim();
}

async function checkPort(address, port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`V2 requires ${address}:${port} to be free`)));
    server.listen(port, address, () => server.close(resolve));
  });
}

async function waitForPort(address, port, signal) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !signal.aborted) {
    const ready = await new Promise(resolve => {
      const connection = createConnection(port, address);
      connection.once("error", () => resolve(false));
      connection.once("connect", () => { connection.destroy(); resolve(true); });
    });
    if (ready) return;
    await delay(100);
  }
  if (!signal.aborted) throw new Error(`V2 did not start listening on ${address}:${port}`);
}

async function serve(env, phone, onReady) {
  const webArgs = ["apps/web/node_modules/next/dist/bin/next", "dev", "--hostname", phone?.address ?? host,
    "--port", String(ports.web)];
  if (phone) webArgs.push("--experimental-https", "--experimental-https-cert", phone.certFile,
    "--experimental-https-key", phone.keyFile);

  const children = [
    ["API", ["apps/api/dist/main.js"]],
    ["worker", ["apps/api/dist/worker.js"]],
    ["web", webArgs, "apps/web"],
  ].map(([name, args, cwd]) => {
    if (cwd) args[0] = fileURLToPath(new URL(`../../${args[0]}`, import.meta.url));
    const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit", detached: true });
    return { name, child };
  });
  const readiness = new AbortController();
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    readiness.abort();
    for (const { child } of children) {
      if (!child.pid) continue;
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  };
  const exits = Promise.allSettled(children.map(({ name, child }) => new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (stopping) resolve();
      else reject(new Error(`V2 ${name} exited with ${signal ?? code}`));
    });
  }).finally(stop)));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await Promise.all([waitForPort(host, ports.api, readiness.signal),
      waitForPort(phone?.address ?? host, ports.web, readiness.signal)]);
    if (!stopping) onReady();
  } catch (error) {
    stop();
    await exits;
    throw error;
  }
  const results = await exits;
  const failure = results.find(result => result.status === "rejected");
  if (failure) throw failure.reason;
}

function dockerSocket(env, backend) {
  if (backend === "embedded") return undefined;
  const result = spawnSync("docker", ["context", "inspect", "--format", "{{ .Endpoints.docker.Host }}"],
    { env, encoding: "utf8" });
  if (!backend && result.error?.code === "ENOENT") return undefined;
  const socket = result.stdout?.trim();
  if (result.status !== 0 || !socket?.startsWith("unix:///")) throw new Error("V2 requires a local Docker socket");
  return socket;
}

function localCertificate(phone, env) {
  if (!phone?.generate) return phone;
  checkLocalTargets(true);
  const directory = join(state, `tls-${phone.address}`);
  checkDirectory(directory);
  if (!existsSync(directory)) {
    const temporary = mkdtempSync(join(state, "tls-"));
    try {
      // Use a config because macOS's system openssl need not support -addext.
      const config = join(temporary, "openssl.cnf");
      writeFileSync(config, `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=${phone.address}\n[ext]\nsubjectAltName=IP:${phone.address}\n`, { mode: 0o600 });
      run("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "180",
        "-config", config, "-out", join(temporary, "cert.pem"), "-keyout", join(temporary, "key.pem")], env);
      validatePhoneCertificate(phone.address, join(temporary, "cert.pem"), join(temporary, "key.pem"));
      renameSync(temporary, directory);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  return validatePhoneCertificate(phone.address, join(directory, "cert.pem"), join(directory, "key.pem"));
}

function startDocker(dockerHost, baseEnv, settings) {
  const composeEnv = {
    ...baseEnv, V2_DATABASE: database, V2_POSTGRES_DATA: postgresData, V2_DATABASE_PORT: String(ports.database),
    V2_ADMIN_USER: new URL(migrationUrl).username, V2_ADMIN_PASSWORD: new URL(migrationUrl).password,
    V2_STORAGE_PORT: String(ports.storage), V2_STORAGE_USER: settings.S3_ACCESS_KEY_ID,
    V2_STORAGE_PASSWORD: settings.S3_SECRET_ACCESS_KEY,
  };
  const compose = (args, capture) => run("docker", ["--host", dockerHost, "compose", "--env-file", "/dev/null",
    "--project-name", "jobguard-v2", "--file", "tools/v2/compose.yml", ...args], composeEnv, capture);
  compose(["up", "-d", "--wait", "postgres", "minio"]);
  const systemId = compose(["exec", "-T", "postgres", "psql", "-XAt", "-U", composeEnv.V2_ADMIN_USER,
    "-d", database, "-c", "SELECT system_identifier FROM pg_control_system()"], true);
  compose(["exec", "-T", "-e", "NO_PROXY=127.0.0.1", "-e", "no_proxy=127.0.0.1",
    "-e", `V2_BUCKET=${bucket}`, "minio", "sh", "-ec", `
      export MC_HOST_v2="http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@127.0.0.1:9000"
      export MC_CONFIG_DIR=/tmp/v2-mc
      mc mb --ignore-existing "v2/$V2_BUCKET"
      mc anonymous set none "v2/$V2_BUCKET"
      mc version enable "v2/$V2_BUCKET"
    `]);

  return { id: systemId };
}

async function start() {
  const { settings, phone: phoneSettings, backend } = validateSettings(process.env);
  refuseDotenvFiles(root);
  checkLocalTargets();
  const baseEnv = hostEnvironment(["PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "TMPDIR", "XDG_CACHE_HOME"]);
  const dependencyEnv = { ...baseEnv, ...hostEnvironment(["COREPACK_HOME", "npm_config_store_dir", "NODE_EXTRA_CA_CERTS"]) };
  const dockerHost = dockerSocket(baseEnv, backend);
  await Promise.all([checkPort(phoneSettings?.address ?? host, ports.web), checkPort(host, ports.api),
    ...(dockerHost ? [] : [checkPort(host, ports.database)])]);
  const phone = localCertificate(phoneSettings, baseEnv);
  run("corepack", ["pnpm", "install", "--frozen-lockfile"], dependencyEnv);
  run("corepack", ["pnpm", "--recursive", "--workspace-concurrency=2", "--filter", "@jobguard/web^...",
    "--filter", "!@jobguard/mobile", "run", "build"], dependencyEnv);

  const runtimeEnv = { ...baseEnv, ...settings, JOBGUARD_LOCAL_V2: "1",
    NODE_OPTIONS: `--import=${new URL("./network.mjs", import.meta.url).href}`,
    ...(dockerHost ? {} : { JOBGUARD_V2_STORAGE_DIR: storageData }) };
  delete runtimeEnv.MIGRATION_DATABASE_URL;
  if (!dockerHost) for (const key of Object.keys(runtimeEnv).filter(key => key.startsWith("S3_"))) delete runtimeEnv[key];

  const postgres = dockerHost ? startDocker(dockerHost, baseEnv, settings) : await (await import("./embedded.mjs")).startEmbedded();
  try {
    run(process.execPath, ["tools/v2/bootstrap.mjs", postgres.id, dockerHost ? "docker" : "embedded"], runtimeEnv);
    await serve({ ...runtimeEnv, AUTH_CODE_SECRET: authSecret() }, phone, () => {
      const signIn = `${settings.AUTH_ALLOWED_ORIGIN}/sign-in`;
      console.log(`JobGuard V2 ${phone ? "phone" : "web"}: ${signIn}`);
      console.log("Owner sign-in: builder@jobguard-v2.invalid. Use the practice code on the sign-in page.");
      if (phone) console.log("A self-signed certificate can show a warning on your phone. You can choose whether to trust it.");
      const api = phone ? `${settings.AUTH_ALLOWED_ORIGIN}${settings.NEXT_PUBLIC_API_URL}` : settings.NEXT_PUBLIC_API_URL;
      console.log(`JobGuard V2 API: ${api}/healthz`);
    });
  } finally {
    await postgres.stop?.();
  }
}

try { await start(); }
catch (error) {
  console.error(`V2 start failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
