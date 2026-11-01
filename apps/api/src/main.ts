import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { parseApiEnvironment } from "@jobguard/config";
import { AppModule } from "./app.module.js";
import { configureOpenApi } from "./bootstrap.js";
import { RedactingLogger } from "./safe-logging.js";

const logger = new RedactingLogger();
try {
  const port = parseApiEnvironment(process.env).API_PORT;
  const app = await NestFactory.create(AppModule, { logger, abortOnError: false });
  configureOpenApi(app);
  await app.listen(port);
} catch {
  logger.error("SERVER_START_FAILED");
  process.exit(1);
}
