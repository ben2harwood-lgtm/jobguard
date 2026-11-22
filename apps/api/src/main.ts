import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { parseApiEnvironment, refusePilotResourcesOutsidePilot, requirePilotResources } from "@jobguard/config";
import { assertPilotConnection } from "@jobguard/db";
import { Pool } from "pg";
import { pilotApiIngress } from "./pilot-ingress.js";
import { AppModule } from "./app.module.js";
import { configureOpenApi } from "./bootstrap.js";
import { RedactingLogger } from "./safe-logging.js";

const logger = new RedactingLogger();
try {
  const port = parseApiEnvironment(process.env).API_PORT;
  refusePilotResourcesOutsidePilot(process.env);
  const pilot = process.env.JOBGUARD_ENV === "pilot_no_charge" ? requirePilotResources(process.env, "api") : undefined;
  const app = await NestFactory.create(AppModule, { logger, abortOnError: false });
  if (pilot) {
    await assertPilotConnection(app.get(Pool), pilot.runtime);
    const identity = new Pool({ connectionString: pilot.identity, connectionTimeoutMillis: 10_000 });
    try { await assertPilotConnection(identity, pilot.identity); }
    finally { await identity.end(); }
    app.use(pilotApiIngress(pilot.apiOrigin));
  }
  configureOpenApi(app);
  await app.listen(port);
} catch {
  logger.error("SERVER_START_FAILED");
  process.exit(1);
}
