import "reflect-metadata";
import { readFile, writeFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureOpenApi } from "./bootstrap.js";

const output = new URL("../openapi.json", import.meta.url);
const app = await NestFactory.create(AppModule, { logger: false });
const serialized = `${JSON.stringify(configureOpenApi(app), null, 2)}\n`;
await app.close();
if (process.argv.includes("--check")) {
  const committed = await readFile(output, "utf8");
  if (committed !== serialized) throw new Error("openapi.json is stale; run pnpm --filter @jobguard/api openapi:generate");
} else await writeFile(output, serialized);
