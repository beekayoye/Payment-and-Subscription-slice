import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth-utils";

// POST /api/auth/reset-password — Reset password using emailed token

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { email, token, newPassword } = body;

    if (!email || !token || !newPassword) {
      return NextResponse.json(
        { error: { code: "MISSING_FIELDS", message: "Email, token, and new password are required." } },
        { status: 400 },
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: { code: "WEAK_PASSWORD", message: "New password must be at least 6 characters." } },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Invalid or expired password reset link." } },
        { status: 400 },
      );
    }

    const now = new Date();
    if (!user.resetToken || user.resetToken !== token.trim() || !user.resetExpires || user.resetExpires < now) {
      return NextResponse.json(
        { error: { code: "INVALID_OR_EXPIRED_TOKEN", message: "This password reset link is invalid or has expired." } },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetExpires: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Password reset successful. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to reset password." } },
      { status: 500 },
    );
  }
}
