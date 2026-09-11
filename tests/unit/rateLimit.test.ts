import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "../../src/lib/rateLimit.ts";

test("Checkout Rate Limiter via RateLimitBucket (FR-10, FR-32, Rule 14)", async (t) => {
  const testKey = `test_user_rl_${Date.now()}`;

  await t.test("allows up to 5 requests within a 1-minute window", async () => {
    for (let i = 1; i <= 5; i++) {
      const result = await checkRateLimit(testKey, 5, 60000);
      assert.equal(result.allowed, true, `Request ${i} should be allowed`);
      assert.equal(result.retryAfterSeconds, 0);
    }
  });

  await t.test("blocks the 6th request with retryAfterSeconds", async () => {
    const result = await checkRateLimit(testKey, 5, 60000);
    assert.equal(result.allowed, false, "6th request should be blocked");
    assert.equal(result.retryAfterSeconds > 0, true, "retryAfterSeconds should be > 0");
  });
});
