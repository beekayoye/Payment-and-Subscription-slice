import { db } from "@/lib/db";

// Rate limiter for checkout initiation, backed strictly by the RateLimitBucket Postgres
// table — never Redis, never in-memory (see .agents/rules/skills/add-checkout-rate-limiting.md,
// PRD FR-32, Rule 14).

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowDurationMs: number = 60000,
): Promise<RateLimitResult> {
  const now = Date.now();
  // Align to current window start (e.g. start of minute)
  const windowStart = new Date(Math.floor(now / windowDurationMs) * windowDurationMs);
  const windowEnd = windowStart.getTime() + windowDurationMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now) / 1000));

  try {
    const bucket = await db.$transaction(async (tx) => {
      // Upsert the bucket row for (key, windowStart)
      return tx.rateLimitBucket.upsert({
        where: {
          key_windowStart: {
            key,
            windowStart,
          },
        },
        create: {
          key,
          windowStart,
          count: 1,
        },
        update: {
          count: {
            increment: 1,
          },
        },
      });
    });

    if (bucket.count > limit) {
      return {
        allowed: false,
        retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  } catch (error) {
    // If rate limit table check fails, log and rethrow per code style guidelines (no silent catch)
    console.error("Rate limit check failed:", error);
    throw new Error("Unable to verify rate limit status at this time.");
  }
}

/**
 * Checks both user and IP rate limits for checkout initiation (FR-32).
 * 5 requests/user/minute and 20 requests/IP/minute.
 */
export async function checkCheckoutRateLimit(
  userId: string,
  clientIp: string,
): Promise<RateLimitResult> {
  // Check user limit: 5 requests / min
  const userResult = await checkRateLimit(`user:${userId}`, 5, 60000);
  if (!userResult.allowed) {
    return userResult;
  }

  // Check IP limit: 20 requests / min
  const ipResult = await checkRateLimit(`ip:${clientIp}`, 20, 60000);
  if (!ipResult.allowed) {
    return ipResult;
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
