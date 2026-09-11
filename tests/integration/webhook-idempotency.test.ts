import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { db } from "../../src/lib/db.ts";

test("Webhook Idempotency (FR-31, Rule 5)", async () => {
  const secretHash = process.env.FLW_SECRET_HASH || "test_secret_hash";
  const uniqueTxId = `idempotency_tx_${Date.now()}`;
  const testUserId = `user_idempotency_${Date.now()}`;

  // Pre-seed a User row
  await db.user.create({
    data: {
      id: testUserId,
      email: `${testUserId}@example.com`,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
      name: "Idempotency Test User",
      emailVerified: true,
    },
  });

  // Pre-seed an INITIATION row so webhook finds the user
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

  const payload = {
    event: "charge.completed",
    id: uniqueTxId,
    data: {
      id: uniqueTxId,
      tx_ref: `tx_ref_${uniqueTxId}`,
      status: "successful",
      amount: 9,
      currency: "USD",
      customer: { email: `${testUserId}@example.com` },
    },
  };

  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", secretHash).update(rawBody).digest("hex");

  // Call 1: First delivery via HTTP to running Next.js app
  const res1 = await fetch("http://localhost:3000/api/webhooks/flutterwave", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "flutterwave-signature": signature,
    },
    body: rawBody,
  });

  assert.equal(res1.status, 200);

  // Check that VERIFICATION event was written
  const verificationCount1 = await db.paymentEvent.count({
    where: { providerEventId: uniqueTxId },
  });
  assert.equal(verificationCount1, 1);

  // Call 2: Replay identical event (simulating Flutterwave retry)
  const res2 = await fetch("http://localhost:3000/api/webhooks/flutterwave", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "flutterwave-signature": signature,
    },
    body: rawBody,
  });

  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.idempotent, true);

  // Must still have exactly ONE event row for this providerEventId
  const verificationCount2 = await db.paymentEvent.count({
    where: { providerEventId: uniqueTxId },
  });
  assert.equal(verificationCount2, 1);

  // Subscription must remain valid and not duplicated
  const subs = await db.subscription.findMany({
    where: { userId: testUserId },
  });
  assert.equal(subs.length, 1);
  assert.equal(subs[0].status, "ACTIVE");
});
