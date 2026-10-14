import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { it } from "vitest";
import { migrate } from "../src/index.js";
import { freePort } from "./pool-test-utils.js";
it("probe", async () => {
process.env.JOBGUARD_ENV = "synthetic_demo";
const dir = await mkdtemp(join(tmpdir(), "jg-probe-")); const port = await freePort(58900, 300);
const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
await pg.initialise(); await pg.start();
const c = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await c.query("CREATE DATABASE jobguard_synthetic_demo"); await c.end();
const admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
await migrate(admin);
const out: Record<string, unknown> = {};
const qs = JSON.parse(await (await import("node:fs/promises")).readFile("/private/tmp/claude-501/lp0/q.json","utf8")) as Record<string,string>;
for (const [k, q] of Object.entries(qs)) { try { out[k] = (await admin.query(q)).rows; } catch (e) { out[k] = String(e); } }
await writeFile("/private/tmp/claude-501/lp0/out.json", JSON.stringify(out, null, 1));
await admin.end(); await pg.stop();
}, 600000);
