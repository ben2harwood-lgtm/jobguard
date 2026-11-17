import "server-only";
import { MeterTodayApplication, MeterWorkStateApplication } from "@jobguard/api/workspace";
import { MeterTodayRepository, JobWorkStateRepository } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";

export function meterApplication() { return new MeterTodayApplication(identityApplication(), new MeterTodayRepository(syntheticPool())); }

export function meterWorkApplication() {
  return new MeterWorkStateApplication(identityApplication(), new JobWorkStateRepository(syntheticPool()));
}
