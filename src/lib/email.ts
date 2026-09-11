import nodemailer from "nodemailer";

// Nodemailer Email Service configuration and email sending routines.
// Reads SMTP configuration from environment variables (.env).
// Falls back to development console logging when SMTP credentials are not configured.

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "Subscription System <no-reply@subscriptionsystem.local>";

function createTransporter() {
  if (!SMTP_HOST || !SMTP_USER) {
    // In local development/test mode without active SMTP credentials
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

const transporter = createTransporter();

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string | false;
}

/**
 * Sends an email verification code and link to a newly registered user.
 */
export async function sendVerificationEmail(
  to: string,
  name: string,
  code: string,
  token?: string,
): Promise<SendEmailResult> {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const verificationLink = `${appUrl}/verify-email?email=${encodeURIComponent(to)}&code=${encodeURIComponent(code)}&token=${token || ""}`;

  const subject = "Verify Your Email Address — Subscription System";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 20px; color: #16181d; line-height: 1.6;">
      <h2 style="color: #004ed4; margin-top: 0;">Welcome to Subscription System, ${name}!</h2>
      <p>Thank you for creating an account. Please use the following 6-digit verification code to complete your registration:</p>
      <div style="background-color: #f0f1f4; padding: 16px 24px; border-radius: 8px; font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; color: #004ed4; margin: 24px 0;">
        ${code}
      </div>
      <p>Or click the button below to verify your email automatically:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${verificationLink}" style="background-color: #004ed4; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      <p style="color: #646668; font-size: 13px; margin-top: 32px; border-top: 1px solid #e5e5e6; paddingTop: 16px;">
        This code and verification link will expire in 24 hours. If you did not create an account, you can safely ignore this email.
      </p>
    </div>
  `;

  if (!transporter) {
    console.log("=================================================");
    console.log(`[EMAIL DISPATCH - DEV PREVIEW] Verification Email`);
    console.log(`To: ${to}`);
    console.log(`Verification Code: ${code}`);
    console.log(`Verification Link: ${verificationLink}`);
    console.log("=================================================");
    return { success: true, messageId: `mock_${Date.now()}` };
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Failed to send verification email via Nodemailer:", error);
    return { success: false };
  }
}

/**
 * Sends a password reset email containing a secure token link.
 */
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string,
): Promise<SendEmailResult> {
  const subject = "Reset Your Password — Subscription System";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 20px; color: #16181d; line-height: 1.6;">
      <h2 style="color: #004ed4; margin-top: 0;">Password Reset Request</h2>
      <p>Hello ${name},</p>
      <p>We received a request to reset your password for your Subscription System account. Click the button below to choose a new password:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${resetUrl}" style="background-color: #004ed4; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #004ed4; font-size: 13px;">${resetUrl}</p>
      <p style="color: #646668; font-size: 13px; margin-top: 32px; border-top: 1px solid #e5e5e6; paddingTop: 16px;">
        This link is valid for 1 hour. If you did not request a password reset, no changes have been made to your account.
      </p>
    </div>
  `;

  if (!transporter) {
    console.log("=================================================");
    console.log(`[EMAIL DISPATCH - DEV PREVIEW] Password Reset Email`);
    console.log(`To: ${to}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log("=================================================");
    return { success: true, messageId: `mock_reset_${Date.now()}` };
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Failed to send password reset email via Nodemailer:", error);
    return { success: false };
  }
}
