"use client";

import Link from "next/link";

// Required per G7 & Rule 12 — no unhandled exception in the payment path may reach the
// framework default error page. Provides retry capability and clear navigation escape hatches.

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ maxWidth: "560px", margin: "3rem auto", textAlign: "center" }}>
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid var(--color-surface-variant, #e5e5e6)",
          padding: "2.5rem 2rem",
          boxShadow: "var(--shadow-medium-shadow, 0 4px 16px rgba(0, 0, 0, 0.06))",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "var(--color-error-container, #fdd2ce)",
            color: "var(--color-error, #c51707)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.75rem",
            margin: "0 auto 1.25rem auto",
            fontWeight: "bold",
          }}
        >
          !
        </div>

        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "#16181d" }}>
          Something went wrong
        </h1>
        <p style={{ color: "#646668", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.75rem" }}>
          {error.message || "An unexpected error occurred while processing your request in the subscription path."}
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
          <button type="button" onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <Link href="/plans" className="btn btn-secondary">
            Return to Plans
          </Link>
        </div>
      </div>
    </div>
  );
}
