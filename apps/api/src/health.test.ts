import "reflect-metadata";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";

describe("GET /healthz", () => {
  it("reports liveness without configuring or opening a datasource", async () => {
    delete process.env.DATABASE_URL;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication();
    await app.init();
    const response = await request(app.getHttpServer()).get("/healthz").expect(200);
    expect(response.body).toEqual({ status: "ok" });
    await app.close();
  });
});
