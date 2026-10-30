import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),end:vi.fn(),release:vi.fn(),pool:vi.fn()}));
vi.mock("pg",()=>({Pool:class {
 constructor(options:unknown){state.pool(options);}
 connect=state.connect;
 end=state.end;
}}));
import { seedSubscriptionPeriod } from "../../e2e/subscription-period-fixture";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it("requires the CI setup environment before opening an admin connection",async()=>{
 vi.stubEnv("E2E_ADMIN_DATABASE_URL","");vi.stubEnv("AUTH_CODE_SECRET","");
 await expect(seedSubscriptionPeriod("tenant","session")).rejects.toThrow("requires the e2e setup environment");
 expect(state.pool).not.toHaveBeenCalled();
});
it("uses CI-supplied admin credentials and the same configured identity digest secret",async()=>{
 vi.stubEnv("E2E_ADMIN_DATABASE_URL","postgresql://fixture.invalid/synthetic");
 vi.stubEnv("AUTH_CODE_SECRET","different-ci-only-synthetic-secret");
 state.connect.mockResolvedValue({query:state.query,release:state.release});
 state.query.mockResolvedValue({rows:[{start_date:"2026-09-01",end_date:"2026-10-01"}]});
 await seedSubscriptionPeriod("tenant","session");
 expect(state.pool).toHaveBeenCalledWith({connectionString:process.env.E2E_ADMIN_DATABASE_URL});
 expect(state.query).toHaveBeenCalledWith("SELECT app.mon1_store_fixture($1,$2,$3,$4::jsonb)",[
  "tenant",createHmac("sha256",process.env.AUTH_CODE_SECRET!).update("session:session").digest("hex"),expect.any(String),expect.any(String)]);
 expect(state.release).toHaveBeenCalledOnce();expect(state.end).toHaveBeenCalledOnce();
});
