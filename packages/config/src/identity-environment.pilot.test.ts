import { expect, it } from "vitest";
import { parseIdentityEnvironment } from "./identity-environment.js";

const fixture = {
  JOBGUARD_ENV: "pilot_no_charge",
  IDENTITY_DATABASE_URL: "postgresql://jobguard_identity:fictional@db.invalid/jobguard_pilot_fixture",
  AUTH_CODE_SECRET: "fictional-identity-key".repeat(2),
  AUTH_ALLOWED_ORIGIN: "https://pilot-fixture.invalid",
};

it("parses the server-selected first-owner list by normalized exact email", () => {
  const parsed = parseIdentityEnvironment({ ...fixture, PILOT_FIRST_OWNER_EMAILS: " Builder@Fixture.Invalid , owner@fixture.invalid " });
  expect(parsed.PILOT_FIRST_OWNER_EMAILS).toEqual(["builder@fixture.invalid", "owner@fixture.invalid"]);
});

it("defaults to an absent first-owner list and rejects malformed lists", () => {
  expect(parseIdentityEnvironment(fixture).PILOT_FIRST_OWNER_EMAILS).toBeUndefined();
  for (const value of ["*", "@fixture.invalid", "builder@fixture.invalid,"]) {
    expect(() => parseIdentityEnvironment({ ...fixture, PILOT_FIRST_OWNER_EMAILS: value })).toThrow();
  }
});
