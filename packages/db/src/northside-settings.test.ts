import { describe, expect, it } from "vitest";
import { northsideSettingLabel, northsideSettingsNotice, northsideSettings, northsideSettingsPath, northsideSettingsV1 } from "./northside-settings.js";

describe("Northside fixture settings", () => {
  it("SETTINGS-PATH chooses the supervisor/client chain with exact pence comparisons", () => {
    const roles = (net: number | null) => northsideSettingsPath(net).map(s => s.role);
    expect(roles(100000)).toEqual(["supervisor"]);
    expect(roles(100001)).toEqual(["supervisor", "client_approver"]);
    expect(roles(108000)).toEqual(["supervisor", "client_approver"]);
    expect(roles(150000)).toEqual(["supervisor", "client_approver"]);
    expect(roles(150001)).toEqual(["supervisor", "commercial_manager", "client_approver"]);
    expect(roles(null)).toEqual(["supervisor", "commercial_manager", "client_approver"]);
    expect(() => roles(100000.1)).toThrow();
  });
  it("SETTINGS-LABEL never presents fixture limits as real rules or operational permission", () => {
    expect(northsideSettings.label).toBe("Demo setting, not a real rule");
    expect(northsideSettings.notice).toBe("Demo settings, not real rules — Ben sets these before any real customer");
    expect(northsideSettingLabel).toBe(northsideSettings.label);
    expect(northsideSettingsNotice).toBe(northsideSettings.notice);
    expect(northsideSettings).toMatchObject({ version: "northside-settings.v1", classification: "demo_settings", timers: "not_scheduled", workTiming: "unavailable", proceedPermission: "not_granted" });
    expect(northsideSettingsV1.safeParse({ ...northsideSettings, classification: "real_rules" }).success).toBe(false);
    expect(northsideSettingsV1.safeParse({ ...northsideSettings, actualTesterReference: "spoofed" }).success).toBe(false);
  });
});
