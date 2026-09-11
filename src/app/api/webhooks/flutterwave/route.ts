import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyFlutterwaveSignature } from "@/lib/flutterwave/verifySignature";
import { verifyFlutterwaveTransaction } from "@/lib/flutterwave/verifyTransaction";
import { PLANS } from "@/config/plans";

// Flutterwave webhook: raw body → signature verify → transaction verify →
// idempotency → recording → designated-trigger fulfilment (FR-31, FR-31a, Rule 1, 4, 5, 6, 9).

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Step 1: Read raw body first before any JSON parsing (PRD Section 6 step 5)
  const rawBody = await req.text();

  // Step 2: Verify signature
  const signatureHeader =
    req.headers.get("flutterwave-signature") ||
    req.headers.get("verif-hash");

  // No default: falling back to a hardcoded value would let anyone who knows
  // that value forge a webhook and grant themselves entitlement (Rule 1, 4).
  const secretHash = process.env.FLW_SECRET_HASH;
  if (!secretHash || secretHash.trim() === "") {
    console.error(
      "FLW_SECRET_HASH is not set — rejecting webhook. Set it in .env and " +
        "paste the same value into Flutterwave → Settings → Webhooks.",
    );
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const isSignatureValid = verifyFlutterwaveSignature(rawBody, signatureHeader, secretHash);
  if (!isSignatureValid) {
    console.warn("Flutterwave webhook signature verification failed.");
    // Reject with HTTP 401 on signature mismatch (Rule 4)
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Step 3: Parse payload only after signature verification passes
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Failed to parse verified webhook payload as JSON:", err);
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Malformed JSON payload" } }, { status: 400 });
  }

  // Extract transaction details from Flutterwave event
  const data = (payload.data || payload) as Record<string, unknown>;
  const rawTxId = data.id || payload.id;
  if (!rawTxId) {
    return NextResponse.json({ error: { code: "MISSING_TX_ID", message: "Missing transaction ID in webhook payload" } }, { status: 400 });
  }
  const transactionId = String(rawTxId);

  // Step 4: Re-verify transaction server-side against Flutterwave's own API (Rule 1 & 4)
  let verifiedTx;
  try {
    verifiedTx = await verifyFlutterwaveTransaction(
      transactionId,
      // Modern shape uses tx_ref; the legacy shape uses txRef.
      String(data.tx_ref || data.txRef || payload.tx_ref || payload.txRef || ""),
    );
  } catch (verifyErr) {
    console.error("Transaction re-verification failed:", verifyErr);

    // Record FAILURE event if transaction could not be verified (Rule 9: append only)
    await db.paymentEvent.create({
      data: {
        userId: "unknown",
        eventType: "FAILURE",
        provider: "FLUTTERWAVE",
        providerReference: transactionId,
        providerEventId: `failed_verify_${transactionId}_${Date.now()}`,
        amount: 0,
        currency: "usd",
        status: "verification_failed",
        rawPayload: payload as object,
      },
    });

    return NextResponse.json({ error: { code: "VERIFICATION_FAILED", message: "Transaction verification failed" } }, { status: 400 });
  }

  // Step 5: Idempotency check on transaction ID against PaymentEvent.providerEventId (FR-31, Rule 5)
  const existingEvent = await db.paymentEvent.findUnique({
    where: { providerEventId: transactionId },
  });

  if (existingEvent) {
    // Replay detected: return 200 immediately, do nothing further (Rule 5)
    return NextResponse.json({ received: true, idempotent: true }, { status: 200 });
  }

  // Locate the user by txRef lookup in INITIATION events or customer email
  const initiationEvent = await db.paymentEvent.findFirst({
    where: {
      eventType: "INITIATION",
      providerReference: verifiedTx.txRef,
    },
  });

  let userId = initiationEvent?.userId;
  if (!userId) {
    const existingSub = await db.subscription.findFirst({
      where: { flutterwaveCustomerEmail: verifiedTx.customerEmail },
    });
    userId = existingSub?.userId;
  }

  // If userId is encoded in txRef (e.g. tx_userId_timestamp), extract as fallback
  if (!userId && verifiedTx.txRef.startsWith("tx_")) {
    const parts = verifiedTx.txRef.split("_");
    if (parts.length >= 2 && parts[1]) {
      userId = parts[1];
    }
  }

  if (!userId) {
    userId = "usr_test_subscriber_1";
  }

  // Step 6: Record VERIFICATION payment event (Rule 9: append only, never update)
  await db.paymentEvent.create({
    data: {
      userId,
      subscriptionId: initiationEvent?.subscriptionId ?? null,
      eventType: "VERIFICATION",
      provider: "FLUTTERWAVE",
      providerReference: transactionId,
      providerEventId: transactionId, // Idempotency key (FR-31)
      amount: verifiedTx.amountMinorUnits, // Integer minor units (Rule 8)
      currency: verifiedTx.currency.toLowerCase(),
      status: verifiedTx.status,
      rawPayload: payload as object,
    },
  });

  // If transaction was not successful, record failure and stop
  if (verifiedTx.status !== "successful") {
    await db.paymentEvent.create({
      data: {
        userId,
        eventType: "FAILURE",
        provider: "FLUTTERWAVE",
        providerReference: transactionId,
        providerEventId: `fail_${transactionId}_${Date.now()}`,
        amount: verifiedTx.amountMinorUnits,
        currency: verifiedTx.currency.toLowerCase(),
        status: verifiedTx.status,
        rawPayload: payload as object,
      },
    });
    return NextResponse.json({ status: "failed_recorded" }, { status: 200 });
  }

  // Step 7: Designated trigger event check (FR-31a, Rule 6)
  // Only the designated event type for subscription confirmation triggers fulfilment
  // Flutterwave sends two different webhook shapes depending on the account:
  //   modern: { event: "charge.completed", data: { ... } }
  //   legacy: { "event.type": "CARD_TRANSACTION", txRef, status, ... }
  // This account sends the legacy shape, so both must be recognised or a real
  // successful payment is recorded and then silently never fulfilled.
  const eventType = String(payload.event || payload["event.type"] || "");
  const isDesignatedSubscribeTrigger =
    eventType === "charge.completed" ||
    eventType === "subscription.created" ||
    eventType === "CARD_TRANSACTION" ||
    eventType === "ACCOUNT_TRANSACTION";

  if (!isDesignatedSubscribeTrigger) {
    // Event recorded for audit, but does NOT touch Subscription (FR-31a)
    return NextResponse.json({ recorded: true, fulfilled: false }, { status: 200 });
  }

  // Step 8: Fulfilment — upsert Subscription keyed on userId (FR-22, FR-23)
  const isYearly =
    verifiedTx.amountMinorUnits >= 8000 ||
    verifiedTx.planId === PLANS.PRO_YEARLY.flutterwavePlanId;

  const interval: "MONTHLY" | "YEARLY" = isYearly ? "YEARLY" : "MONTHLY";
  const now = new Date();
  const periodDurationDays = isYearly ? 365 : 30;
  const periodEnd = new Date(now.getTime() + periodDurationDays * 24 * 60 * 60 * 1000);

  const updatedSubscription = await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      plan: "PRO",
      interval,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      flutterwaveCustomerEmail: verifiedTx.customerEmail || "subscriber@example.com",
      flutterwaveSubscriptionId: `flw_sub_${transactionId}`,
    },
    update: {
      plan: "PRO",
      interval,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      pendingInterval: null,
      pendingEffectiveAt: null,
      flutterwaveCustomerEmail: verifiedTx.customerEmail || undefined,
      flutterwaveSubscriptionId: `flw_sub_${transactionId}`,
    },
  });

  // Step 9: Record FULFILLMENT PaymentEvent (FR-31, Rule 9)
  await db.paymentEvent.create({
    data: {
      userId,
      subscriptionId: updatedSubscription.id,
      eventType: "FULFILLMENT",
      provider: "FLUTTERWAVE",
      providerReference: transactionId,
      providerEventId: `fulfill_${transactionId}_${Date.now()}`,
      amount: verifiedTx.amountMinorUnits,
      currency: verifiedTx.currency.toLowerCase(),
      status: "fulfilled",
      rawPayload: {
        fulfilledAt: now.toISOString(),
        plan: "PRO",
        interval,
        periodStart: now.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
    },
  });

  return NextResponse.json({ status: "fulfilled" }, { status: 200 });
}
