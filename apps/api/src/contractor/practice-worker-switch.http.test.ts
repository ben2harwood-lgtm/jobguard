import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { APP_GUARD } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { Pool } from "pg";
import request from "supertest";
import { PracticeWorkerSwitchError, practiceWorkerSwitchErrorCodes, practiceWorkerSwitchHttpStatus } from "@jobguard/core";
import { ApplicationAuthGuard } from "../auth/application-auth.guard.js";
import { IDENTITY_APPLICATION } from "../auth/identity-http.js";
import { PracticeWorkerSwitchApplication } from "./practice-worker-switch.application.js";
import { PracticeWorkerSwitchController } from "./practice-worker-switch.controller.js";
let app: INestApplication;
const pool = { query: vi.fn(), connect: vi.fn() }, origin = "https://practice.example.invalid";
const base = "/contractor/practice", target = randomUUID();
const post = () => request(app.getHttpServer()).post(`${base}/workers/${target}/acting-as`).set("Origin", origin).set("Cookie", `jg_session=${randomUUID()}`);
beforeEach(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin); vi.clearAllMocks();
 const module = await Test.createTestingModule({ controllers: [PracticeWorkerSwitchController], providers: [{ provide: Pool, useValue: pool }, { provide: IDENTITY_APPLICATION, useValue: () => ({ context: async () => { throw new Error("UNAUTHENTICATED"); } }) }, { provide: APP_GUARD, useClass: ApplicationAuthGuard }] }).compile(); app = module.createNestApplication(); await app.init();
});
afterEach(async () => { await app?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("[PW24] real framework refuses malformed JSON before service", async () => { const service = vi.spyOn(PracticeWorkerSwitchApplication.prototype, "start"); expect((await post().set("Content-Type", "application/json").send("{invalid")).status).toBe(400); expect(service).not.toHaveBeenCalled(); });
it("[PW24] real guard refuses absent cookie before service", async () => { const service = vi.spyOn(PracticeWorkerSwitchApplication.prototype, "read"); expect((await request(app.getHttpServer()).get(`${base}/acting-as`)).status).toBe(401); expect(service).not.toHaveBeenCalled(); });
it.each([undefined, "null", "https://foreign.invalid"])("[PW24] Origin %s refused before service", async value => {
 const service = vi.spyOn(PracticeWorkerSwitchApplication.prototype, "start"); const call = request(app.getHttpServer()).post(`${base}/workers/${target}/acting-as`).set("Cookie", `jg_session=${randomUUID()}`); if (value !== undefined) call.set("Origin", value);
 const result = await call.send({}); expect(result.status).toBe(403); expect(result.body).toEqual({ version: "practice-worker-switch-error.v1", code: "ORIGIN_FORBIDDEN" }); expect(service).not.toHaveBeenCalled(); expect(result.headers["cache-control"]).toBe("no-store");
});
it.each(practiceWorkerSwitchErrorCodes)("[PW3] [PW9] [PW23] [PW24] real controller maps %s with no cookie and no-store", async code => {
 vi.spyOn(PracticeWorkerSwitchApplication.prototype, "start").mockRejectedValue(new PracticeWorkerSwitchError(code)); const result = await post().send({}); expect(result.status).toBe(practiceWorkerSwitchHttpStatus(code)); expect(result.body).toEqual({ version: "practice-worker-switch-error.v1", code }); expect(result.headers["set-cookie"]).toBeUndefined(); expect(result.headers["cache-control"]).toBe("no-store");
});
it.each(["pilot_no_charge", "production_billing", "", undefined, "SYNTHETIC_DEMO", " synthetic_demo"])("[PW19] unchanged global guard refuses mode %s before service", async mode => {
 if (mode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = mode;
 const service = vi.spyOn(PracticeWorkerSwitchApplication.prototype, "start"); expect((await post().send({})).status).toBe(401); expect(service).not.toHaveBeenCalled(); expect(pool.query).not.toHaveBeenCalled(); expect(pool.connect).not.toHaveBeenCalled();
});
