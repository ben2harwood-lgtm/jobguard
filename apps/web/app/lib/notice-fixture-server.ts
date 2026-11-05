import "server-only";
import { NoticeFixtureApplication, assertNoticeFixtureMode } from "@jobguard/api/workspace";
import { NoticeFixtureRepository } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export function noticeFixtureApplication() {
  assertNoticeFixtureMode();
  return new NoticeFixtureApplication(identityApplication(), new NoticeFixtureRepository(syntheticPool()));
}
