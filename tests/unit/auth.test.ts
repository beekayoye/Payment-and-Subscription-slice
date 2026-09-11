import test from "node:test";
import assert from "node:assert/strict";
import {
  generateCryptoToken,
  generateVerificationCode,
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
} from "../../src/lib/auth-utils.ts";

test("Auth Utilities: crypto.randomBytes(32) token and code generation", async (t) => {
  await t.test("generateCryptoToken returns a 64-character hex string", () => {
    const token1 = generateCryptoToken();
    const token2 = generateCryptoToken();

    assert.equal(typeof token1, "string");
    assert.equal(token1.length, 64);
    assert.match(token1, /^[0-9a-f]{64}$/);
    assert.notEqual(token1, token2, "Subsequent tokens must be cryptographically distinct");
  });

  await t.test("generateVerificationCode returns a 6-digit numeric string", () => {
    const code = generateVerificationCode();

    assert.equal(typeof code, "string");
    assert.equal(code.length, 6);
    assert.match(code, /^[0-9]{6}$/);

    const num = parseInt(code, 10);
    assert.ok(num >= 100000 && num <= 999999);
  });
});

test("Auth Utilities: Password Hashing", async (t) => {
  await t.test("hashes password with bcrypt and verifies correctly", async () => {
    const rawPassword = "SuperSecurePassword123!";
    const hash = await hashPassword(rawPassword);

    assert.ok(hash.startsWith("$2"), "Hash should be a bcrypt hash");
    assert.notEqual(hash, rawPassword);

    const isMatch = await verifyPassword(rawPassword, hash);
    assert.equal(isMatch, true);

    const isWrong = await verifyPassword("WrongPassword!", hash);
    assert.equal(isWrong, false);
  });
});

test("Auth Utilities: Session Token Signing & Verification", async (t) => {
  await t.test("signs and verifies valid session tokens", () => {
    const userId = "usr_test_123";
    const email = "alice@example.com";

    const sessionToken = signSessionToken(userId, email);
    assert.ok(sessionToken.includes("."), "Session token must have payload and signature parts");

    const payload = verifySessionToken(sessionToken);
    assert.ok(payload !== null);
    assert.equal(payload?.userId, userId);
    assert.equal(payload?.email, email);
    assert.ok(payload?.exp && payload.exp > Date.now());
  });

  await t.test("rejects tampered session tokens", () => {
    const sessionToken = signSessionToken("usr_123", "alice@example.com");
    const [encodedPayload] = sessionToken.split(".");

    const tampered = `${encodedPayload}.invalidsignature123`;
    const payload = verifySessionToken(tampered);
    assert.equal(payload, null);
  });

  await t.test("rejects malformed session tokens", () => {
    assert.equal(verifySessionToken(""), null);
    assert.equal(verifySessionToken("invalid-token-without-dot"), null);
  });
});
