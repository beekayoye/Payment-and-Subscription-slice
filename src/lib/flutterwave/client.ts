// Thin wrapper around Flutterwave API calls (checkout initiation, direct
// charges, subscription cancel). Nothing outside this module and
// verifySignature.ts / verifyTransaction.ts may talk to Flutterwave (see
// .agents/rules/05-directory-structure.md).
//
// Targets the Flutterwave v3 API (static secret key as Bearer token):
//   POST /v3/payments                  — Standard hosted checkout
//   GET  /v3/transactions/{id}/verify  — server-side verification
//   POST /v3/tokenized-charges         — charge a saved card token
//   PUT  /v3/subscriptions/{id}/cancel — deactivate a subscription
// Docs: https://developer.flutterwave.com/v3.0.0/

const FLUTTERWAVE_API_BASE_URL =
  process.env.FLW_BASE_URL ?? "https://api.flutterwave.com/v3";

/**
 * Mock mode is opt-in via FLW_MOCK_MODE and exists only so the offline test
 * suite can exercise the webhook pipeline without reaching Flutterwave.
 *
 * It must never be inferred from a missing key: doing so turns a
 * misconfigured deployment into one that fabricates successful payments and
 * grants entitlement without money moving (Rule 1).
 */
function isMockMode(): boolean {
  return process.env.FLW_MOCK_MODE === "true";
}

function requireSecretKey(): string {
  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey || secretKey.trim() === "") {
    throw new Error(
      "FLW_SECRET_KEY is not set. Add your Flutterwave test secret key " +
        "(FLWSECK_TEST-...) to .env, or set FLW_MOCK_MODE=true to run the " +
        "offline test suite.",
    );
  }
  return secretKey;
}

function authHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
}

export interface InitiatePaymentParams {
  txRef: string;
  amountMinorUnits: number;
  currency: string;
  customerEmail: string;
  customerName?: string;
  paymentPlanId?: string | null;
  redirectUrl: string;
  title: string;
  description: string;
}

export interface InitiatePaymentResult {
  link: string;
  txRef: string;
}

/**
 * Initiates hosted payment with Flutterwave (FR-9, Section 6 step 1).
 *
 * Passing `paymentPlanId` is what makes this a subscription: Flutterwave
 * automatically subscribes the customer to that plan on the first successful
 * charge, then charges again on the plan's own interval.
 */
export async function initiateFlutterwavePayment(
  params: InitiatePaymentParams,
): Promise<InitiatePaymentResult> {
  if (isMockMode()) {
    const url = new URL(params.redirectUrl);
    url.searchParams.set("status", "successful");
    url.searchParams.set("tx_ref", params.txRef);
    url.searchParams.set("transaction_id", `mock_tx_${Date.now()}`);
    return { link: url.toString(), txRef: params.txRef };
  }

  const secretKey = requireSecretKey();

  // Flutterwave takes major units; we store minor units only (Rule 8).
  const amountMajorUnits = (params.amountMinorUnits / 100).toFixed(2);

  const payload: Record<string, unknown> = {
    tx_ref: params.txRef,
    amount: amountMajorUnits,
    currency: params.currency.toUpperCase(),
    redirect_url: params.redirectUrl,
    customer: {
      email: params.customerEmail,
      name: params.customerName ?? "Subscriber",
    },
    customizations: {
      title: params.title,
      description: params.description,
    },
  };

  if (params.paymentPlanId) {
    payload.payment_plan = params.paymentPlanId;
  }

  const response = await fetch(`${FLUTTERWAVE_API_BASE_URL}/payments`, {
    method: "POST",
    headers: authHeaders(secretKey),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Flutterwave payment initiation failed: HTTP ${response.status} - ${errorText}`,
    );
  }

  const resJson = await response.json();
  if (resJson.status !== "success" || !resJson.data?.link) {
    throw new Error(
      resJson.message || "Failed to obtain hosted payment link from Flutterwave",
    );
  }

  return { link: resJson.data.link, txRef: params.txRef };
}

/**
 * Finds the Flutterwave subscription created for a customer against a plan.
 *
 * Flutterwave does not return a subscription id on the charge itself — the id
 * needed by the cancel endpoint is only available from the subscriptions
 * listing (`data.id`), so it has to be looked up after the first charge.
 */
export async function findFlutterwaveSubscriptionId(
  customerEmail: string,
): Promise<string | null> {
  if (isMockMode()) {
    return `mock_sub_${Date.now()}`;
  }

  const secretKey = requireSecretKey();

  const url = new URL(`${FLUTTERWAVE_API_BASE_URL}/subscriptions`);
  url.searchParams.set("email", customerEmail);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(secretKey),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Flutterwave subscription lookup failed: HTTP ${response.status} - ${errorText}`,
    );
  }

  const body = await response.json();
  const subscriptions: Array<{ id?: number | string; status?: string }> =
    Array.isArray(body.data) ? body.data : [];

  const active =
    subscriptions.find((s) => s.status === "active") ?? subscriptions[0];

  return active?.id != null ? String(active.id) : null;
}

/**
 * Deactivates a subscription in Flutterwave (FR-29).
 *
 * `subscriptionId` must be the numeric id from the subscriptions listing —
 * see findFlutterwaveSubscriptionId().
 */
export async function cancelFlutterwaveSubscription(
  subscriptionId: string,
): Promise<{ success: boolean; message: string }> {
  if (isMockMode() || subscriptionId.startsWith("mock_")) {
    return { success: true, message: "Subscription cancelled in mock test mode" };
  }

  const secretKey = requireSecretKey();

  const response = await fetch(
    `${FLUTTERWAVE_API_BASE_URL}/subscriptions/${subscriptionId}/cancel`,
    {
      method: "PUT",
      headers: authHeaders(secretKey),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Flutterwave subscription cancellation failed: HTTP ${response.status} - ${errorText}`,
    );
  }

  const data = await response.json();
  return {
    success: data.status === "success",
    message: data.message ?? "Subscription cancelled",
  };
}

/**
 * Direct charge for upgrade proration against the customer's saved card
 * token (FR-25).
 *
 * Per the v3 tokenized-charges reference, token / email / currency / country /
 * amount / tx_ref / redirect_url are all required, and the email must match
 * the one used on the original charge.
 */
export async function chargeProrationDirect(params: {
  customerEmail: string;
  amountMinorUnits: number;
  currency: string;
  txRef: string;
  cardToken?: string | null;
  country?: string;
  redirectUrl?: string;
}): Promise<{ transactionId: string; status: string }> {
  if (isMockMode()) {
    return {
      transactionId: `mock_proration_${Date.now()}`,
      status: "successful",
    };
  }

  const secretKey = requireSecretKey();

  if (!params.cardToken) {
    throw new Error(
      "Cannot charge proration: no saved Flutterwave card token for this " +
        "customer. The token is returned on the first successful charge " +
        "(data.card.token) and must be stored before an upgrade can be charged.",
    );
  }

  const response = await fetch(`${FLUTTERWAVE_API_BASE_URL}/tokenized-charges`, {
    method: "POST",
    headers: authHeaders(secretKey),
    body: JSON.stringify({
      token: params.cardToken,
      email: params.customerEmail,
      amount: (params.amountMinorUnits / 100).toFixed(2),
      currency: params.currency.toUpperCase(),
      country: params.country ?? "NG",
      tx_ref: params.txRef,
      redirect_url:
        params.redirectUrl ??
        `${process.env.APP_URL ?? "http://localhost:3000"}/checkout/return`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Flutterwave tokenized proration charge failed: HTTP ${response.status} - ${errorText}`,
    );
  }

  const resJson = await response.json();
  return {
    transactionId: String(resJson.data?.id ?? ""),
    status: resJson.data?.status ?? "failed",
  };
}

export { FLUTTERWAVE_API_BASE_URL, isMockMode };
