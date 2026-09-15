import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { seedDemo, type DemoSeedCommand } from "./demo-seed.js";

const environment = process.env.JOBGUARD_ENV ?? "synthetic_demo";
const target = resolve(process.env.JOBGUARD_DEMO_SEED_FILE ?? ".jobguard/demo-seed.json");
const existing = JSON.parse(await readFile(target, "utf8").catch(() => "{}")) as Record<string, DemoSeedCommand>;
const next = { ...existing };
const result = await seedDemo(environment as never, {
  async execute(command) {
    if (existing[command.semanticKey]) return "replayed";
    next[command.semanticKey] = command;
    return "created";
  },
});
await mkdir(dirname(target), { recursive: true });
const temporary = `${target}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx" });
await rename(temporary, target);
process.stdout.write(`${JSON.stringify({ environment, tenantId: result.length ? Object.values(next)[0]?.tenantId : null, checkpoints: result })}\n`);
