import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateCryptoToken } from "@/lib/auth-utils";
import { sendPasswordResetEmail } from "@/lib/email";

// POST /api/auth/forgot-password — Request Password Reset via Nodemailer

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { email } = body;

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

    if (user) {
      // Generate 32-byte crypto token for reset link
      const resetToken = generateCryptoToken();
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetExpires,
        },
      });

      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const resetUrl = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;

      await sendPasswordResetEmail(normalizedEmail, user.name, resetUrl);
    }

    // Generic success response to avoid email enumeration
    return NextResponse.json({
      success: true,
      message: "If an account with that email exists, we have sent a password reset link.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to process password reset request." } },
      { status: 500 },
    );
  }
}
