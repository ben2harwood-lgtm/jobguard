import { expect, it } from "vitest";
import { emptyMobileAuthStateV1, mobileAuthStateV1 } from "./mobile-auth-state.js";

it("refuses incompatible stored versions and unexpected bearer fields rather than resetting state", () => {
 const state = emptyMobileAuthStateV1();
 expect(mobileAuthStateV1.safeParse(state).success).toBe(true);
 for (const invalid of [{ ...state, version: "mobile-auth-state.v2" }, { ...state, environment: "production" }, { ...state, credential: "fictional-bearer" }, { ...state, families: [["not-a-uuid", {}]] }]) {
  expect(mobileAuthStateV1.safeParse(invalid).success).toBe(false);
 }
});
