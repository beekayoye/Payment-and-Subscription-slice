import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth-utils";
import { setSessionCookie } from "@/lib/auth";

// POST /api/auth/signin — Sign in user and set auth_session cookie

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: { code: "MISSING_FIELDS", message: "Email and password are required." } },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } },
        { status: 401 },
      );
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } },
        { status: 401 },
      );
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        {
          error: {
            code: "EMAIL_NOT_VERIFIED",
            message: "Please verify your email address before signing in.",
          },
          requiresVerification: true,
          email: user.email,
        },
        { status: 403 },
      );
    }

    await setSessionCookie(user.id, user.email);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Sign in error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to sign in." } },
      { status: 500 },
    );
  }
}
