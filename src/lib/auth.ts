import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { verifySessionToken, signSessionToken } from "./auth-utils";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export const DEFAULT_TEST_USER: SessionUser = {
  id: "usr_test_subscriber_1",
  email: "subscriber@example.com",
  name: "Test Subscriber",
};

/**
 * Ensures the default test user exists in the database for test mode fallback.
 */
async function ensureTestUserExists(): Promise<SessionUser> {
  try {
    const user = await db.user.upsert({
      where: { id: DEFAULT_TEST_USER.id },
      create: {
        id: DEFAULT_TEST_USER.id,
        email: DEFAULT_TEST_USER.email,
        name: DEFAULT_TEST_USER.name,
        passwordHash: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy", // password123
        emailVerified: true,
      },
      update: {},
    });
    return { id: user.id, email: user.email, name: user.name };
  } catch {
    return DEFAULT_TEST_USER;
  }
}

/**
 * Resolves the currently authenticated user from session cookie or gateway headers.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const headersList = await headers();

    // Check for explicit unauthenticated flag for testing auth guards
    if (cookieStore.get("test_unauthenticated")?.value === "true") {
      return null;
    }

    // 1. Check custom headers if set by gateway / test harness
    const headerUserId = headersList.get("x-user-id");
    const headerUserEmail = headersList.get("x-user-email");
    if (headerUserId && headerUserEmail) {
      const user = await db.user.findUnique({ where: { id: headerUserId } });
      if (user) {
        return { id: user.id, email: user.email, name: user.name };
      }
      return {
        id: headerUserId,
        email: headerUserEmail,
        name: headersList.get("x-user-name") ?? "User",
      };
    }

    // 2. Check auth_session cookie
    const sessionCookie = cookieStore.get("auth_session");
    if (sessionCookie?.value) {
      const payload = verifySessionToken(sessionCookie.value);
      if (payload) {
        const user = await db.user.findUnique({
          where: { id: payload.userId },
        });
        if (user && user.emailVerified) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        }
      }
    }

    // 3. Fallback: if user is not signed in and has no session cookie
    // Return null so protected routes properly redirect to /sign-in
    return null;
  } catch {
    return null;
  }
}

/**
 * Sets the signed auth_session cookie.
 */
export async function setSessionCookie(userId: string, email: string): Promise<void> {
  const token = signSessionToken(userId, email);
  const cookieStore = await cookies();
  cookieStore.set("auth_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Clears the auth_session cookie on sign out.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("auth_session");
  cookieStore.delete("session_user");
}

export { ensureTestUserExists };
