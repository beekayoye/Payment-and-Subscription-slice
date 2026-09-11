"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setUnverifiedEmail(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.requiresVerification) {
          setUnverifiedEmail(data.email || email);
          throw new Error(data.error?.message || "Please verify your email address.");
        }
        throw new Error(data.error?.message || "Invalid email or password.");
      }

      router.push("/plans");
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Sign in failed.");
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
            Sign In
          </h1>
          <p style={{ color: "var(--color-on-surface-variant, #4b4c4e)", fontSize: "0.95rem", margin: 0 }}>
            Enter your credentials to access your account
          </p>
        </div>

        {errorMessage && (
          <div className="alert alert-error">
            <div>
              <span>{errorMessage}</span>
              {unverifiedEmail && (
                <div style={{ marginTop: "0.5rem" }}>
                  <Link
                    href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                    style={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}
                  >
                    Click here to enter verification code
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

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

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
              <label style={{ fontSize: "0.9rem", fontWeight: 600 }}>Password</label>
              <Link
                href="/forgot-password"
                style={{ fontSize: "0.85rem", color: "var(--color-primary, #004ed4)", textDecoration: "none" }}
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
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
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "1.75rem", fontSize: "0.9rem", color: "#646668" }}>
          Don&apos;t have an account yet?{" "}
          <Link href="/sign-up" style={{ color: "var(--color-primary, #004ed4)", fontWeight: 600, textDecoration: "none" }}>
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
