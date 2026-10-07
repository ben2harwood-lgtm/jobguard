import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";

describe("GET /healthz", () => {
  it("reports liveness without configuring or opening a datasource", async () => {
    delete process.env.DATABASE_URL;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      // Dispatch through the actual Express/Nest route without opening a listener.
      const req = new IncomingMessage(new Socket()); req.method = "GET"; req.url = "/healthz";
      const res = new ServerResponse(req);
      const body = await new Promise<string>((resolve, reject) => {
        res.end = ((bytes: Buffer | string) => { resolve(bytes.toString()); return res; }) as typeof res.end;
        app.getHttpAdapter().getInstance().handle(req, res, reject);
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(body)).toEqual({ status: "ok" });
    } finally { await app.close(); }
  });
});
