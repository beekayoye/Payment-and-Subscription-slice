import test from "node:test";
import assert from "node:assert/strict";
import { hasProAccess } from "../../src/lib/entitlement.ts";
import type { Subscription } from "../../src/generated/prisma/client.ts";

test("Entitlement check: hasProAccess()", async (t) => {
  await t.test("returns false when subscription is null (no row exists)", () => {
    assert.equal(hasProAccess(null), false);
  });

  await t.test("returns false when user is on FREE plan", () => {
    const sub = {
      plan: "FREE",
      status: "ACTIVE",
    } as Subscription;
    assert.equal(hasProAccess(sub), false);
  });

  await t.test("returns false when user is on FREE plan with CANCELED status (A16)", () => {
    const sub = {
      plan: "FREE",
      status: "CANCELED",
    } as Subscription;
    assert.equal(hasProAccess(sub), false);
  });

  await t.test("returns false when PRO subscription is still INCOMPLETE (FR-22, Rule 1)", () => {
    const sub = {
      plan: "PRO",
      status: "INCOMPLETE",
    } as Subscription;
    assert.equal(hasProAccess(sub), false);
  });

  await t.test("returns true when PRO subscription is ACTIVE", () => {
    const sub = {
      plan: "PRO",
      status: "ACTIVE",
    } as Subscription;
    assert.equal(hasProAccess(sub), true);
  });

  await t.test("returns true when PRO subscription is CANCEL_SCHEDULED (access retained, Rule 10)", () => {
    const sub = {
      plan: "PRO",
      status: "CANCEL_SCHEDULED",
    } as Subscription;
    assert.equal(hasProAccess(sub), true);
  });

  await t.test("returns false when PRO subscription is fully CANCELED (FR-30)", () => {
    const sub = {
      plan: "PRO",
      status: "CANCELED",
    } as Subscription;
    assert.equal(hasProAccess(sub), false);
  });

  await t.test("returns false when PRO subscription is PAST_DUE (N4)", () => {
    const sub = {
      plan: "PRO",
      status: "PAST_DUE",
    } as Subscription;
    assert.equal(hasProAccess(sub), false);
  });
});
