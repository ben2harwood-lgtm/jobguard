import { describe, expect, it } from "vitest";
import { catalogueAdditions } from "./upgrade-proof-utils.js";

const row = (name: string, privilege = "owner-only") => ({ name, privilege });
describe("catalogue addition ordering", () => {
  it("restores final database order when an earlier addition used positions including later customer rows", () => {
    const original = [row("identity.challenge"), row("identity.request_window"), row("identity.session")];
    const customers = [row("app.customer_portal_grant"), row("app.customer_portal_session")];
    const oidc = [row("identity.oidc_assertion_use"), row("identity.oidc_request")];
    const live = [customers[0]!, customers[1]!, original[0]!, oidc[0]!, oidc[1]!, original[1]!, original[2]!].map(value => ({ ...value }));
    // OIDC was appended while the two customer relations were not present yet.
    const earlier = [...original, ...oidc];
    expect(catalogueAdditions(earlier, customers, live)).toEqual(live);
    expect(earlier).toEqual([...original, ...oidc]);
    expect(original).toHaveLength(3);
  });

  it("retains historical privileges so a changed live grant still fails the full comparison", () => {
    const historical = row("identity.session"), customer = row("app.customer_portal_session");
    const live = [customer, row("identity.session", "runtime UPDATE")];
    const expected = catalogueAdditions([historical], [customer], live);
    expect(expected).toContain(historical);
    expect(expected).not.toEqual(live);
  });

  it("never copies an unapproved catalogue row into the expected union", () => {
    const historical = row("identity.session"), customer = row("app.customer_portal_session");
    const unexpected = row("app.unapproved_table"), live = [unexpected, customer, historical];
    expect(catalogueAdditions([historical], [customer], live)).toEqual([customer, historical]);
  });
});
