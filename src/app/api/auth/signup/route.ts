import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, generateVerificationCode, generateCryptoToken } from "@/lib/auth-utils";
import { sendVerificationEmail } from "@/lib/email";

// POST /api/auth/signup — Create Account with Nodemailer verification code dispatch

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { name, email, password } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: { code: "INVALID_NAME", message: "Full name is required." } },
        { status: 400 },
      );
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: { code: "INVALID_EMAIL", message: "A valid email address is required." } },
        { status: 400 },
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: { code: "WEAK_PASSWORD", message: "Password must be at least 6 characters." } },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser && existingUser.emailVerified) {
      return NextResponse.json(
        { error: { code: "USER_EXISTS", message: "An account with this email address already exists." } },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    // Generate verification code and crypto.randomBytes(32) token
    const verificationCode = generateVerificationCode();
    const cryptoToken = generateCryptoToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    if (existingUser && !existingUser.emailVerified) {
      await db.user.update({
        where: { id: existingUser.id },
        data: {
          name: name.trim(),
          passwordHash,
          verificationCode,
          resetToken: cryptoToken,
          verificationExpires,
        },
      });
    } else {
      await db.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          emailVerified: false,
          verificationCode,
          resetToken: cryptoToken,
          verificationExpires,
        },
      });
    }

    // Dispatch verification email via Nodemailer
    await sendVerificationEmail(normalizedEmail, name.trim(), verificationCode, cryptoToken);

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      message: "Account created. Please check your email for the verification code.",
    });
  } catch (error) {
    console.error("Sign up error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create account. Please try again." } },
      { status: 500 },
    );
  }
}
