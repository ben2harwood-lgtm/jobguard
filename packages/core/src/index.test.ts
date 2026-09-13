import { describe, expect, it } from "vitest";
import { CORE_PACKAGE } from "./index.js";
describe("core package", () => { it("exports its identity", () => expect(CORE_PACKAGE).toBe("@jobguard/core")); });
