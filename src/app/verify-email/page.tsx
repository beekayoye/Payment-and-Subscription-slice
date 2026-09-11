"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    const codeParam = searchParams.get("code");
    const tokenParam = searchParams.get("token");

    if (emailParam) {
      setEmail(emailParam);
    }
    if (codeParam) {
      setCode(codeParam);
    }

    // Auto-verify if both email and token or code exist in URL
    if (emailParam && (codeParam || tokenParam)) {
      const autoVerify = async () => {
        setIsLoading(true);
        try {
          const res = await fetch("/api/auth/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailParam,
              code: codeParam || undefined,
              token: tokenParam || undefined,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            setStatusMessage({ type: "success", text: "Email verified successfully! Redirecting..." });
            setTimeout(() => {
              router.push("/plans");
              router.refresh();
            }, 1200);
          } else {
            setStatusMessage({ type: "error", text: data.error?.message || "Verification failed." });
          }
        } catch {
          setStatusMessage({ type: "error", text: "Verification failed. Please try manually entering your code." });
        } finally {
          setIsLoading(false);
        }
      };
      autoVerify();
    }
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !code) {
      setStatusMessage({ type: "error", text: "Please enter your email and verification code." });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to verify code.");
      }

      setStatusMessage({ type: "success", text: "Email verified successfully! Redirecting..." });
      setTimeout(() => {
        router.push("/plans");
        router.refresh();
      }, 1200);
    } catch (err: unknown) {
      setStatusMessage({ type: "error", text: err instanceof Error ? err.message : "Verification failed." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setStatusMessage({ type: "error", text: "Please enter your email address to resend the code." });
      return;
    }

    setIsResending(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action: "resend" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to resend verification code.");
      }

      setStatusMessage({ type: "success", text: data.message || "A new verification code has been sent." });
    } catch (err: unknown) {
      setStatusMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to resend code." });
    } finally {
      setIsResending(false);
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
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "var(--color-primary-container, #ccdfff)",
              color: "var(--color-on-primary-container, #003899)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
              margin: "0 auto 1rem auto",
            }}
          >
            ✉
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: "0 0 0.5rem 0", letterSpacing: "-0.02em" }}>
            Verify Your Email
          </h1>
          <p style={{ color: "var(--color-on-surface-variant, #4b4c4e)", fontSize: "0.95rem", margin: 0 }}>
            Enter the 6-digit verification code sent to your email address.
          </p>
        </div>

        {statusMessage && (
          <div className={statusMessage.type === "success" ? "alert alert-success" : "alert alert-error"}>
            <span>{statusMessage.text}</span>
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
            <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              6-Digit Verification Code
            </label>
            <input
              type="text"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="123456"
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                border: "1px solid #dee2e6",
                fontSize: "1.25rem",
                fontWeight: 700,
                textAlign: "center",
                letterSpacing: "4px",
                fontFamily: "inherit",
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || isResending}
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            {isLoading ? "Verifying..." : "Verify Email"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "1.75rem", borderTop: "1px solid #f0f1f4", paddingTop: "1.25rem" }}>
          <p style={{ fontSize: "0.9rem", color: "#646668", marginBottom: "0.5rem" }}>
            Didn&apos;t receive the verification code?
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || isLoading}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-primary, #004ed4)",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            {isResending ? "Resending Code..." : "Resend Verification Code"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.9rem" }}>
          <Link href="/sign-in" style={{ color: "#646668", textDecoration: "none" }}>
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div>Loading verification...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
