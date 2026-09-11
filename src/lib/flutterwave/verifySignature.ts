import { createHmac, timingSafeEqual } from "node:crypto";

// Verifies the webhook signature header against the raw body and secret hash.
// Must run before the body is parsed as JSON and before anything in the
// payload is trusted (PRD Section 6 step 5, adapted for Flutterwave; see
// .agents/rules/04-flutterwave-integration.md and
// .agents/rules/skills/implement-flutterwave-webhook.md).
export function verifyFlutterwaveSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretHash: string,
): boolean {
  if (!signatureHeader || !secretHash) {
    return false;
  }

  // 1. Primary: HMAC-SHA256 check per AGENTS.md Q2 table
  const expectedHmac = createHmac("sha256", secretHash)
    .update(rawBody)
    .digest("hex");

  const expectedHmacBuf = Buffer.from(expectedHmac, "utf8");
  const receivedBuf = Buffer.from(signatureHeader, "utf8");

  if (expectedHmacBuf.length === receivedBuf.length && timingSafeEqual(expectedHmacBuf, receivedBuf)) {
    return true;
  }

  // 2. Compatibility check: direct secret-hash match (standard Flutterwave verif-hash)
  const secretHashBuf = Buffer.from(secretHash, "utf8");
  if (secretHashBuf.length === receivedBuf.length && timingSafeEqual(secretHashBuf, receivedBuf)) {
    return true;
  }

  return false;
}
