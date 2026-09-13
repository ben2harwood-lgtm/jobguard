import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { parseApiEnvironment } from "@jobguard/config";
import { AppModule } from "./app.module.js";
import { configureOpenApi } from "./bootstrap.js";

const app = await NestFactory.create(AppModule);
configureOpenApi(app);
await app.listen(parseApiEnvironment(process.env).API_PORT);
