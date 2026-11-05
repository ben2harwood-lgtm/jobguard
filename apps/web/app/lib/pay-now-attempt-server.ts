import "server-only";
import { PayNowAttemptApplication, assertPayNowPreviewMode } from "@jobguard/api/workspace";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export function payNowAttemptApplication() {
  assertPayNowPreviewMode();
  return new PayNowAttemptApplication(identityApplication(), syntheticPool());
}
