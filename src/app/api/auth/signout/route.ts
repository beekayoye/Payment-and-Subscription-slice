import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

// POST /api/auth/signout — Clear auth_session cookie

export async function POST(): Promise<NextResponse> {
  try {
    await clearSessionCookie();
    return NextResponse.json({ success: true, message: "Signed out successfully." });
  } catch (error) {
    console.error("Sign out error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to sign out." } },
      { status: 500 },
    );
  }
}
