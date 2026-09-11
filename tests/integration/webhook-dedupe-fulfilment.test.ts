import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { db } from "../../src/lib/db.ts";

test("Webhook Multiple Events Deduplication on Fulfilment (FR-31a, Rule 6)", async () => {
  const secretHash = process.env.FLW_SECRET_HASH || "test_secret_hash";
  const uniqueTxId = `dedupe_tx_${Date.now()}`;
  const testUserId = `user_dedupe_${Date.now()}`;

  // Pre-seed a User row
  await db.user.create({
    data: {
      id: testUserId,
      email: `${testUserId}@example.com`,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
      name: "Dedupe Test User",
      emailVerified: true,
    },
  });

  // Pre-seed an INITIATION row
  await db.paymentEvent.create({
    data: {
      userId: testUserId,
      eventType: "INITIATION",
      provider: "FLUTTERWAVE",
      providerReference: `tx_ref_${uniqueTxId}`,
      providerEventId: null,
      amount: 900,
      currency: "usd",
      status: "initiated",
      rawPayload: { planId: "PRO_MONTHLY" },
    },
  });

  // Event 1: Secondary/ancillary event (e.g. "subscription.created" or non-designated event)
  const nonDesignatedPayload = {
    event: "transfer.completed", // not the designated subscription fulfilment trigger
    id: `${uniqueTxId}_transfer`,
    data: {
      id: `${uniqueTxId}_transfer`,
      tx_ref: `tx_ref_${uniqueTxId}`,
      status: "successful",
      amount: 9,
      currency: "USD",
      customer: { email: `${testUserId}@example.com` },
    },
  };

  const rawBody1 = JSON.stringify(nonDesignatedPayload);
  const signature1 = createHmac("sha256", secretHash).update(rawBody1).digest("hex");

  const res1 = await fetch("http://localhost:3000/api/webhooks/flutterwave", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "flutterwave-signature": signature1,
    },
    body: rawBody1,
  });

  assert.equal(res1.status, 200);
  const body1 = await res1.json();
  assert.equal(body1.recorded, true);
  assert.equal(body1.fulfilled, false);

  // Assert that NO FULFILLMENT event has been written yet (FR-31a)
  const fulfillmentCountBefore = await db.paymentEvent.count({
    where: {
      userId: testUserId,
      eventType: "FULFILLMENT",
    },
  });
  assert.equal(fulfillmentCountBefore, 0);

  // Event 2: Designated fulfilment trigger ("charge.completed")
  const designatedPayload = {
    event: "charge.completed",
    id: `${uniqueTxId}_charge`,
    data: {
      id: `${uniqueTxId}_charge`,
      tx_ref: `tx_ref_${uniqueTxId}`,
      status: "successful",
      amount: 9,
      currency: "USD",
      customer: { email: `${testUserId}@example.com` },
    },
  };

  const rawBody2 = JSON.stringify(designatedPayload);
  const signature2 = createHmac("sha256", secretHash).update(rawBody2).digest("hex");

  const res2 = await fetch("http://localhost:3000/api/webhooks/flutterwave", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "flutterwave-signature": signature2,
    },
    body: rawBody2,
  });

  assert.equal(res2.status, 200);
  const body2 = await res2.json();
  assert.equal(body2.status, "fulfilled");

  // Assert that exactly ONE FULFILLMENT row was written for this entire transition (FR-31a, Rule 6)
  const fulfillmentCountAfter = await db.paymentEvent.count({
    where: {
      userId: testUserId,
      eventType: "FULFILLMENT",
    },
  });
  assert.equal(fulfillmentCountAfter, 1);
});
