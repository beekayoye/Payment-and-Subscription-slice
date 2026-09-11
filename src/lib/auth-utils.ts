import crypto from "node:crypto";
import bcrypt from "bcryptjs";

// Cryptographic token & verification code generation, password hashing, and session signing.
// Uses crypto.randomBytes(32) as explicitly requested.

const AUTH_SECRET = process.env.AUTH_SECRET || "default_local_test_auth_secret_minimum_32_chars";

/**
 * Generates a 32-byte cryptographically secure random token (64-char hex string)
 * using crypto.randomBytes(32).
 */
export function generateCryptoToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generates a 6-digit numeric verification code derived from crypto.randomBytes(32).
 */
export function generateVerificationCode(): string {
  const bytes = crypto.randomBytes(32);
  const num = bytes.readUInt32BE(0);
  const code = (num % 900000) + 100000;
  return code.toString();
}

/**
 * Hashes a plaintext password using bcrypt with salt rounds = 10.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface SessionPayload {
  userId: string;
  email: string;
  exp: number;
}

/**
 * Creates a signed session token for authenticated users.
 */
export function signSessionToken(userId: string, email: string): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload: SessionPayload = { userId, email, exp };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies a signed session token and returns the payload if valid and not expired.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSig = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(encodedPayload)
      .digest("base64url");

    const expectedBuf = Buffer.from(expectedSig);
    const receivedBuf = Buffer.from(signature);

    if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Date.now()) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}
