import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { generateVerificationCode, generateCryptoToken } from "@/lib/auth-utils";
import { sendVerificationEmail } from "@/lib/email";

// POST /api/auth/verify-email — Email Verification & Resend Control

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { email, code, token, action } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: { code: "INVALID_EMAIL", message: "Email is required." } },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: { code: "USER_NOT_FOUND", message: "Account not found." } },
        { status: 404 },
      );
    }

    // Handle RESEND action
    if (action === "resend") {
      const newCode = generateVerificationCode();
      const newToken = generateCryptoToken();
      const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.user.update({
        where: { id: user.id },
        data: {
          verificationCode: newCode,
          resetToken: newToken,
          verificationExpires: newExpires,
        },
      });

      await sendVerificationEmail(normalizedEmail, user.name, newCode, newToken);

      return NextResponse.json({
        success: true,
        message: "A new verification code has been sent to your email address.",
      });
    }

    // Handle VERIFY action
    if (!code && !token) {
      return NextResponse.json(
        { error: { code: "MISSING_CODE", message: "Verification code is required." } },
        { status: 400 },
      );
    }

    const now = new Date();
    if (user.verificationExpires && user.verificationExpires < now) {
      return NextResponse.json(
        { error: { code: "CODE_EXPIRED", message: "Verification code has expired. Please click resend code." } },
        { status: 400 },
      );
    }

    const isCodeMatch = code && user.verificationCode && user.verificationCode.trim() === String(code).trim();
    const isTokenMatch = token && user.resetToken && user.resetToken.trim() === String(token).trim();

    if (!isCodeMatch && !isTokenMatch) {
      return NextResponse.json(
        { error: { code: "INVALID_CODE", message: "The verification code entered is incorrect." } },
        { status: 400 },
      );
    }

    // Mark email as verified and clear verification tokens
    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationCode: null,
        verificationExpires: null,
        resetToken: null,
      },
    });

    // Establish active session
    await setSessionCookie(updatedUser.id, updatedUser.email);

    return NextResponse.json({
      success: true,
      message: "Email verified successfully.",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
      },
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to verify email." } },
      { status: 500 },
    );
  }
}
