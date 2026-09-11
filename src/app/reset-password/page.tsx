"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage("Missing password reset token. Please request a new link.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to reset password.");
      }

      setIsSuccess(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "460px", margin: "2rem auto" }}>
      <div
        style={{
          background: "var(--color-surface-container-lowest, #ffffff)",
          borderRadius: "14px",
          border: "1.5px solid var(--color-surface-variant, #e5e5e6)",
          padding: "2.5rem 2rem",
          boxShadow: "var(--shadow-medium-shadow, 2px 4px 6px 0px rgba(0, 0, 0, 0.28))",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: "0 0 0.5rem 0", letterSpacing: "-0.02em" }}>
            Reset Password
          </h1>
          <p style={{ color: "var(--color-on-surface-variant, #4b4c4e)", fontSize: "0.95rem", margin: 0 }}>
            Choose a new, secure password for your account
          </p>
        </div>

        {errorMessage && (
          <div className="alert alert-error">
            <span>{errorMessage}</span>
          </div>
        )}

        {isSuccess ? (
          <div style={{ textAlign: "center" }}>
            <div className="alert alert-success" style={{ marginBottom: "1.5rem" }}>
              <span>Your password has been successfully reset!</span>
            </div>
            <Link href="/sign-in" className="btn btn-primary" style={{ display: "inline-block", width: "100%" }}>
              Sign In with New Password
            </Link>
          </div>
        ) : !token ? (
          <div style={{ textAlign: "center" }}>
            <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
              <span>Invalid or missing reset link.</span>
            </div>
            <Link href="/forgot-password" className="btn btn-primary" style={{ display: "inline-block", width: "100%" }}>
              Request New Reset Link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid #dee2e6",
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid #dee2e6",
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{ width: "100%", marginTop: "0.5rem" }}
            >
              {isLoading ? "Resetting password..." : "Reset Password"}
            </button>

            <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
              <Link
                href="/sign-in"
                style={{ fontSize: "0.9rem", color: "var(--color-primary, #004ed4)", textDecoration: "none", fontWeight: 600 }}
              >
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "2rem" }}>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
