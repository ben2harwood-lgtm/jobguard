import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { bucket, database, host, migrationUrl, ports, postgresData, refuseDotenvFiles, validateSettings } from "./settings.mjs";

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

function authSecret() {
  mkdirSync(".jobguard", { recursive: true, mode: 0o700 });
  const path = ".jobguard/v2-auth-secret";
  try { writeFileSync(path, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const secret = readFileSync(path, "utf8");
  if (!/^[a-f0-9]{64}$/u.test(secret)) throw new Error("Invalid V2 sign-in secret file");
  return secret;
}

async function serve(env, phone) {
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
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
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
  const results = await exits;
  const failure = results.find(result => result.status === "rejected");
  if (failure) throw failure.reason;
}

async function start() {
  const { settings, phone } = validateSettings(process.env);
  refuseDotenvFiles(root);
  await Promise.all([checkPort(phone?.address ?? host, ports.web), checkPort(host, ports.api)]);

  const baseEnv = hostEnvironment(["PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "TMPDIR", "XDG_CACHE_HOME"]);
  const dependencyEnv = { ...baseEnv, ...hostEnvironment(["COREPACK_HOME", "npm_config_store_dir", "NODE_EXTRA_CA_CERTS"]) };
  const dockerHost = run("docker", ["context", "inspect", "--format", "{{ .Endpoints.docker.Host }}"], baseEnv, true);
  if (!dockerHost?.startsWith("unix:///")) throw new Error("V2 requires a local Docker socket");
  const composeEnv = {
    ...baseEnv, V2_DATABASE: database, V2_POSTGRES_DATA: postgresData, V2_DATABASE_PORT: String(ports.database),
    V2_ADMIN_USER: new URL(migrationUrl).username, V2_ADMIN_PASSWORD: new URL(migrationUrl).password,
    V2_STORAGE_PORT: String(ports.storage), V2_STORAGE_USER: settings.S3_ACCESS_KEY_ID,
    V2_STORAGE_PASSWORD: settings.S3_SECRET_ACCESS_KEY,
  };
  const compose = (args, capture) => run("docker", ["--host", dockerHost, "compose", "--env-file", "/dev/null",
    "--project-name", "jobguard-v2", "--file", "tools/v2/compose.yml", ...args], composeEnv, capture);
  run("corepack", ["pnpm", "install", "--frozen-lockfile"], dependencyEnv);
  run("corepack", ["pnpm", "--recursive", "--workspace-concurrency=2", "--filter", "@jobguard/web^...",
    "--filter", "!@jobguard/mobile", "run", "build"], dependencyEnv);
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

  const runtimeEnv = { ...baseEnv, ...settings, JOBGUARD_LOCAL_V2: "1",
    NODE_OPTIONS: `--import=${new URL("./network.mjs", import.meta.url).href}` };
  delete runtimeEnv.MIGRATION_DATABASE_URL;
  const secret = authSecret();
  const phoneEnv = hostEnvironment(["JOBGUARD_V2_PHONE_HOST", "JOBGUARD_V2_PHONE_CERT", "JOBGUARD_V2_PHONE_KEY"]);
  run(process.execPath, ["tools/v2/bootstrap.mjs", systemId], { ...runtimeEnv, ...phoneEnv, AUTH_CODE_SECRET: secret });

  console.log(`JobGuard V2 web: ${settings.AUTH_ALLOWED_ORIGIN}/sign-in`);
  console.log(`JobGuard V2 API: ${settings.NEXT_PUBLIC_API_URL}/healthz`);
  await serve({ ...runtimeEnv, AUTH_CODE_SECRET: secret }, phone);
}

try { await start(); }
catch (error) {
  console.error(`V2 start failed: ${error.message}`);
  process.exitCode = 1;
}
