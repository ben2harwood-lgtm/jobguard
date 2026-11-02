import { expect, it } from "vitest";
import { utcDatetimeV1 } from "@jobguard/core";
import { jobWorkspaceResponseV1 } from "./contracts.js";

it("keeps the local workspace datetime language identical to core", () => {
  const local = jobWorkspaceResponseV1.shape.job.shape.updatedAt;
  const values: unknown[] = [undefined, null, 123, "", "not a date"];
  for (const date of ["0000-01-01", "1900-02-29", "2000-02-29", "2026-02-29", "2028-02-29", "2026-04-31", "2026-12-31"])
    for (const time of ["00:00", "23:59", "24:00", "12:30:59", "12:30:60", "12:30:59.123456789", "12:30.1"])
      for (const zone of ["Z", "z", "", "+00:00", "+0130"])
        values.push(`${date}T${time}${zone}`);
  for (const value of values) {
    const expected = utcDatetimeV1.safeParse(value);
    const actual = local.safeParse(value);
    expect(actual.success, String(value)).toBe(expected.success);
    if (expected.success && actual.success) expect(actual.data).toBe(expected.data);
  }
});
