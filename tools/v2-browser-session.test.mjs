import assert from "node:assert/strict";
import { test } from "node:test";
import { signInOnce, v2Origin } from "./v2/test/browser-session.mjs";

test("BH1 v2Origin requires the HTTPS phone origin", t => {
  const previous = process.env.V2_TEST_ORIGIN;
  t.after(() => {
    if (previous === undefined) delete process.env.V2_TEST_ORIGIN;
    else process.env.V2_TEST_ORIGIN = previous;
  });
  delete process.env.V2_TEST_ORIGIN;
  assert.throws(() => v2Origin(), /V2_TEST_ORIGIN.*HTTPS/u);
  process.env.V2_TEST_ORIGIN = "http://127.0.0.1:3499";
  assert.throws(() => v2Origin(), /HTTPS.*Secure/u);
  process.env.V2_TEST_ORIGIN = "https://192.168.1.24:3499";
  assert.equal(v2Origin(), "https://192.168.1.24:3499");
});

test("BH1 names a failed sign-in step and closes its context", async t => {
  const previous = process.env.V2_TEST_ORIGIN;
  process.env.V2_TEST_ORIGIN = "https://192.168.1.24:3499";
  t.after(() => {
    if (previous === undefined) delete process.env.V2_TEST_ORIGIN;
    else process.env.V2_TEST_ORIGIN = previous;
  });
  const failure = new Error("Navigation failed");
  let closed = false;
  const browser = {
    async newContext() {
      return {
        async newPage() { return { async goto() { throw failure; } }; },
        async close() { closed = true; },
      };
    },
  };
  await assert.rejects(signInOnce(browser), error => {
    assert.equal(error.name, "V2BrowserSessionError");
    assert.match(error.message, /open sign-in/u);
    assert.equal(error.cause, failure);
    return true;
  });
  assert.equal(closed, true);
});
