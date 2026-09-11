import { FLUTTERWAVE_API_BASE_URL, isMockMode } from "./client";

// Server-side re-verification of a transaction against Flutterwave's own API,
// required before any entitlement is granted (PRD Section 6, Rule 1 & Rule 4).
//
// v3 endpoint: GET /v3/transactions/{id}/verify
// Docs: https://developer.flutterwave.com/v3.0.0/docs/transaction-verification

export interface VerifiedTransaction {
  id: string;
  txRef: string;
  status: string;
  amountMinorUnits: number;
  currency: string;
  customerEmail: string;
  planId?: string | null;
  /**
   * Saved-card token from data.card.token, when the charge was made with a
   * card. Required later to charge an upgrade's proration without the
   * customer re-entering card details. Never a card number — a provider
   * token only (Rule 7).
   */
  cardToken?: string | null;
}

export async function verifyFlutterwaveTransaction(
  transactionId: string,
  hintTxRef?: string,
): Promise<VerifiedTransaction> {
  // Mock mode is opt-in only (FLW_MOCK_MODE) so that a missing key can never
  // silently manufacture a "successful" transaction (Rule 1).
  if (isMockMode()) {
    return {
      id: transactionId,
      txRef: hintTxRef || `tx_ref_${transactionId}`,
      status: "successful",
      amountMinorUnits: 900,
      currency: "usd",
      customerEmail: "subscriber@example.com",
      planId: process.env.FLW_PLAN_MONTHLY ?? null,
      cardToken: `mock_card_token_${transactionId}`,
    };
  }

  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey || secretKey.trim() === "") {
    throw new Error(
      "FLW_SECRET_KEY is not set — cannot verify transaction with Flutterwave. " +
        "Entitlement must never be granted without server-side verification.",
    );
  }

  const response = await fetch(
    `${FLUTTERWAVE_API_BASE_URL}/transactions/${transactionId}/verify`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Flutterwave transaction verification failed: HTTP ${response.status} - ${errorText}`,
    );
  }

  const body = await response.json();
  const data = body.data;

  if (!data) {
    throw new Error(
      "Invalid transaction verification response from Flutterwave (missing data)",
    );
  }

  // Flutterwave returns major units; convert to whole integer minor units
  // and never carry a float forward (Rule 8).
  const rawAmount =
    typeof data.amount === "number" ? data.amount : parseFloat(data.amount || "0");
  const amountMinorUnits = Math.round(rawAmount * 100);

  return {
    id: String(data.id),
    txRef: data.tx_ref || hintTxRef || "",
    status: data.status,
    amountMinorUnits,
    currency: (data.currency || "usd").toLowerCase(),
    customerEmail: data.customer?.email ?? "",
    planId: data.plan ? String(data.plan) : null,
    cardToken: data.card?.token ? String(data.card.token) : null,
  };
}
