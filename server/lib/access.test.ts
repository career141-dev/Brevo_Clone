import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCompanyEmail, isAllowedUser } from "./access.js";

const verified = (emailAddress: string) => ({ emailAddress, verification: { status: "verified", strategy: "email_code" } });

test("an address vouched for by another company's login does not count", () => {
  const viaMicrosoft = { emailAddress: "ceo@career141.com", verification: { status: "verified", strategy: "from_oauth_microsoft" } };
  assert.equal(hasCompanyEmail([viaMicrosoft], ["career141.com"]), false);
});

test("only a verified company address lets someone in", () => {
  assert.equal(hasCompanyEmail([verified("Sanjeev@Career141.com")], ["career141.com"]), true);
  assert.equal(hasCompanyEmail([verified("someone@gmail.com")], ["career141.com"]), false);
  assert.equal(hasCompanyEmail([{ emailAddress: "new@career141.com", verification: { status: "unverified" } }], ["career141.com"]), false);
  assert.equal(hasCompanyEmail([verified("x@notcareer141.com")], ["career141.com"]), false, "a look-alike domain is not ours");
  assert.equal(hasCompanyEmail([verified("a@gmail.com"), verified("a@career141.com")], ["career141.com"]), true);
});

test("named exceptions skip the lookup; answers are remembered", async () => {
  let lookups = 0;
  const load = async () => { lookups++; return [verified("gajani@career141.com")]; };
  assert.equal(await isAllowedUser("user_named", ["user_named"], load), true);
  assert.equal(lookups, 0);
  assert.equal(await isAllowedUser("user_gajani", [], load), true);
  assert.equal(await isAllowedUser("user_gajani", [], load), true);
  assert.equal(lookups, 1, "second call came from the cache");
});
