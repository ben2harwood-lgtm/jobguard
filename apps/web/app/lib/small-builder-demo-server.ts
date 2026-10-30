import "server-only";
import { SmallBuilderDemoApplication, SmallBuilderTrialDemoApplication, subscriptionAuthority } from "@jobguard/api/workspace";
import { SmallBuilderDemoRepository, SmallBuilderTrialDemoRepository } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export function smallBuilderDemoApplication() {
  return new SmallBuilderDemoApplication(subscriptionAuthority(identityApplication()), new SmallBuilderDemoRepository(syntheticPool()));
}
export function smallBuilderTrialDemoApplication() {
 return new SmallBuilderTrialDemoApplication(subscriptionAuthority(identityApplication()),new SmallBuilderTrialDemoRepository(syntheticPool()));
}
