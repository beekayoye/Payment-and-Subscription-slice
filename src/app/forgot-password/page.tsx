"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to request password reset.");
      }

      setIsSubmitted(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to request password reset.");
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
            Forgot Password
          </h1>
          <p style={{ color: "var(--color-on-surface-variant, #4b4c4e)", fontSize: "0.95rem", margin: 0 }}>
            Enter your email to receive a password reset link
          </p>
        </div>

        {errorMessage && (
          <div className="alert alert-error">
            <span>{errorMessage}</span>
          </div>
        )}

        {isSubmitted ? (
          <div style={{ textAlign: "center" }}>
            <div className="alert alert-info" style={{ marginBottom: "1.5rem", textAlign: "left" }}>
              <span>
                If an account exists for <strong>{email}</strong>, a password reset link has been sent. Please check your inbox and spam folder.
              </span>
            </div>
            <p style={{ fontSize: "0.9rem", color: "var(--color-on-surface-variant, #4b4c4e)", marginBottom: "1.5rem" }}>
              The reset link will expire in 1 hour.
            </p>
            <Link href="/sign-in" className="btn btn-secondary" style={{ display: "inline-block", width: "100%" }}>
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alice@example.com"
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
              {isLoading ? "Sending link..." : "Send Reset Link"}
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
