"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS, type PlanId } from "@/config/plans";

interface CheckoutClientProps {
  initialPlanId: PlanId;
  userEmail: string;
}

export function CheckoutClient({ initialPlanId, userEmail }: CheckoutClientProps) {
  const [selectedPlan, setSelectedPlan] = useState<"PRO_MONTHLY" | "PRO_YEARLY">(
    initialPlanId === "PRO_YEARLY" ? "PRO_YEARLY" : "PRO_MONTHLY",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);

  const planConfig = PLANS[selectedPlan];

  const handleInitiate = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setRetryAfterSeconds(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          // FR-10: specific rate limit message
          setRetryAfterSeconds(data.error?.retryAfterSeconds || 60);
          setErrorMessage(data.error?.message || "Too many attempts, please try again in a few seconds.");
          return;
        }

        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }

        // FR-11: specific retry-capable error screen
        throw new Error(data.error?.message || "Unable to initiate payment with payment provider.");
      }

      if (data.checkoutUrl) {
        // Redirect browser to Flutterwave hosted checkout URL (FR-9)
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("Checkout URL was not returned by the server.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Payment initialization failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/plans"
          style={{ color: "#646668", textDecoration: "none", fontSize: "0.9rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
        >
          ← Back to Plans
        </Link>
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid var(--color-surface-variant, #e5e5e6)",
          padding: "2rem",
          boxShadow: "var(--shadow-medium-shadow, 0 4px 16px rgba(0, 0, 0, 0.06))",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: "0 0 0.5rem 0", letterSpacing: "-0.02em" }}>
          Checkout Initiation
        </h1>
        <p style={{ color: "#646668", fontSize: "0.95rem", margin: "0 0 1.75rem 0" }}>
          You are subscribing as <strong>{userEmail}</strong>. Complete your payment securely via Flutterwave test mode.
        </p>

        {/* FR-10: Rate-limit notification */}
        {retryAfterSeconds && (
          <div className="alert alert-warning">
            <div>
              <strong>Rate limit reached:</strong> Too many checkout attempts. Please wait{" "}
              <strong>{retryAfterSeconds} seconds</strong> before trying again.
            </div>
          </div>
        )}

        {/* FR-11: Retry-capable error box */}
        {errorMessage && !retryAfterSeconds && (
          <div className="alert alert-error">
            <div>
              <strong>Checkout Error:</strong> {errorMessage}
              <div style={{ marginTop: "0.5rem" }}>
                <button
                  onClick={handleInitiate}
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    textDecoration: "underline",
                    cursor: "pointer",
                    padding: 0,
                    fontWeight: 600,
                  }}
                >
                  Retry Payment Initiation
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Select Billing Interval
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <button
              type="button"
              onClick={() => setSelectedPlan("PRO_MONTHLY")}
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: selectedPlan === "PRO_MONTHLY" ? "2px solid var(--color-primary, #004ed4)" : "1px solid #dee2e6",
                background: selectedPlan === "PRO_MONTHLY" ? "var(--color-primary-container, #ccdfff)" : "#ffffff",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>Monthly</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.25rem" }}>$9.00</div>
              <div style={{ fontSize: "0.8rem", color: "#646668" }}>per month</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPlan("PRO_YEARLY")}
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: selectedPlan === "PRO_YEARLY" ? "2px solid var(--color-primary, #004ed4)" : "1px solid #dee2e6",
                background: selectedPlan === "PRO_YEARLY" ? "var(--color-primary-container, #ccdfff)" : "#ffffff",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "1.05rem", display: "flex", justifyContent: "space-between" }}>
                <span>Yearly</span>
                <span className="badge badge-pro" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>Save $18</span>
              </div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.25rem" }}>$90.00</div>
              <div style={{ fontSize: "0.8rem", color: "#646668" }}>per year</div>
            </button>
          </div>
        </div>

        {/* Order Summary */}
        <div
          style={{
            backgroundColor: "var(--color-surface-color, #f9fafb)",
            border: "1px solid var(--color-surface-variant, #e5e5e6)",
            borderRadius: "8px",
            padding: "1.25rem",
            marginBottom: "1.75rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ color: "#646668" }}>Plan</span>
            <span style={{ fontWeight: 600 }}>{planConfig.id === "PRO_MONTHLY" ? "Pro Monthly" : "Pro Yearly"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ color: "#646668" }}>Billing Interval</span>
            <span style={{ fontWeight: 600 }}>{planConfig.interval}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #dee2e6", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
            <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>Total Due Today</span>
            <span style={{ fontWeight: 800, fontSize: "1.25rem", color: "var(--color-primary, #004ed4)" }}>
              ${(planConfig.priceMinorUnits / 100).toFixed(2)} {planConfig.currency.toUpperCase()}
            </span>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "100%", padding: "0.9rem", fontSize: "1.05rem" }}
          onClick={handleInitiate}
          disabled={isLoading || Boolean(retryAfterSeconds)}
        >
          {isLoading ? "Redirecting to Flutterwave..." : `Proceed to Payment ($${(planConfig.priceMinorUnits / 100).toFixed(2)})`}
        </button>

        <p style={{ textAlign: "center", color: "#7d8082", fontSize: "0.8rem", marginTop: "1rem" }}>
          🔒 Test mode sandbox checkout. Card information is captured exclusively by Flutterwave.
        </p>
      </div>
    </div>
  );
}
