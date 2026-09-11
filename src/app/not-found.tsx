import Link from "next/link";

// Required per G7 & Rule 12 — no framework-default 404 may be reachable from the
// payment route group (Plans, Checkout, Return, Billing).

export default function NotFound() {
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
            fontSize: "3rem",
            fontWeight: 900,
            color: "var(--color-primary, #004ed4)",
            lineHeight: 1,
            marginBottom: "1rem",
          }}
        >
          404
        </div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
          Page not found
        </h1>
        <p style={{ color: "#646668", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.75rem" }}>
          The requested payment or billing route does not exist.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
          <Link href="/plans" className="btn btn-primary">
            View Plans
          </Link>
          <Link href="/billing" className="btn btn-secondary">
            Go to Billing
          </Link>
        </div>
      </div>
    </div>
  );
}
