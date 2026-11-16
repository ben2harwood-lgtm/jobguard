import { beforeEach, afterEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({signout:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../../../lib/identity-server",()=>({identityApplication:()=>({signout:f.signout}),identityCredentials:async()=>({sessionToken:"identity",csrfToken:"csrf",origin:"https://practice.invalid"})}));
import { POST } from "./route";
beforeEach(()=>{f.signout.mockReset();f.signout.mockResolvedValue({version:"identity-signed-out.v1"});});
afterEach(()=>vi.restoreAllMocks());
it("clears all three cookies only after identity revocation succeeds",async()=>{
  const response=await POST(new Request("https://practice.invalid/api/auth/signout",{method:"POST"}));
  expect(response.status).toBe(200);expect(f.signout).toHaveBeenCalledWith({sessionToken:"identity",csrfToken:"csrf",origin:"https://practice.invalid"});
  for(const name of ["jobguard_session","jg_session","jg_practice_pair"])expect(response.cookies.get(name)?.value).toBe("");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
});
it("retains browser cookies on revocation failure for an explicit retry",async()=>{
  f.signout.mockRejectedValue(new Error("storage"));const response=await POST(new Request("https://practice.invalid/api/auth/signout",{method:"POST"}));
  expect(response.status).toBe(503);expect(response.headers.get("set-cookie")).toBeNull();
});
