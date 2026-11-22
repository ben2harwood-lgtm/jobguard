import { expect, it } from "vitest";
import { FakeEmail } from "../effects/fake-email.js";
import type { IdentityChallenge } from "./identity-email.js";

const message = {
  version: "identity-email.v1", category: "identity_challenge", challengeId: "10000000-0000-4000-8000-000000000001",
  email: "builder@practice.invalid", code: "01234567", environment: "synthetic_demo",
} satisfies IdentityChallenge;

it("records only a challenge reference and outcome after fixture delivery", async () => {
  const fake = new FakeEmail();
  await fake.identity().deliver(message);
  expect(fake.records).toEqual([{
    request: { category: "identity_challenge", id: message.challengeId },
    outcome: { kind: "delivered", receipt: `fixture:${message.challengeId}` },
  }]);
});

it("refuses commercial content and pilot challenges at the identity fixture boundary", async () => {
  const fake = new FakeEmail();
  const adapter = fake.identity();
  const arbitraryContent = { ...message, body: "Fictional commercial content" };
  await expect(adapter.deliver(arbitraryContent)).rejects.toThrow();
  expect(() => adapter.assertRecipient(message.email, "pilot_no_charge")).toThrow("D04");
  await expect(adapter.deliver({ ...message, environment: "pilot_no_charge" })).rejects.toThrow();
  expect(fake.records).toEqual([]);
});
