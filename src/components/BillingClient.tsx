"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SubscriptionDTO {
  id: string;
  plan: "FREE" | "PRO";
  interval: "MONTHLY" | "YEARLY" | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  pendingInterval: "MONTHLY" | "YEARLY" | null;
  pendingEffectiveAt: string | null;
  cancellationReason: string | null;
}

interface BillingClientProps {
  subscription: SubscriptionDTO | null;
  isPro: boolean;
  userEmail: string;
}

type CancelStep = "NONE" | "CONFIRM" | "REASON";

const REASONS = [
  { value: "TOO_EXPENSIVE", label: "Too expensive" },
  { value: "MISSING_FEATURES", label: "Missing features I need" },
  { value: "SWITCHING_PROVIDER", label: "Switching to another provider" },
  { value: "NOT_USING_ENOUGH", label: "Not using it enough" },
  { value: "TEMPORARY_PAUSE", label: "Just need a temporary break" },
  { value: "OTHER", label: "Other reason" },
];

export function BillingClient({ subscription, isPro, userEmail }: BillingClientProps) {
  const router = useRouter();
  const [cancelStep, setCancelStep] = useState<CancelStep>("NONE");
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [otherReasonText, setOtherReasonText] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  // Determine current plan display text
  let planName = "Free Tier";
  if (isPro) {
    planName = subscription?.interval === "YEARLY" ? "Pro Yearly" : "Pro Monthly";
  }

  // Handle cancellation execution (FR-19, FR-20, FR-21)
  const executeCancellation = async (reasonVal?: string, otherVal?: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reasonVal || selectedReason || undefined,
          reasonOther: otherVal || otherReasonText || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // FR-21: Show specific error inline without optimistic updates
        throw new Error(data.error?.message || "Failed to cancel subscription.");
      }

      setCancelStep("NONE");
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Cancellation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "0 0 0.5rem 0", letterSpacing: "-0.02em" }}>
          Billing & Subscription
        </h1>
        <p style={{ color: "#646668", fontSize: "1rem", margin: 0 }}>
          Manage your subscription details, renewal settings, and plan status.
        </p>
      </div>

      {/* FR-21: Specific inline error display */}
      {errorMessage && (
        <div className="alert alert-error">
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Subscription Status Card (FR-17) */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid var(--color-surface-variant, #e5e5e6)",
          padding: "1.75rem",
          marginBottom: "1.5rem",
          boxShadow: "var(--shadow-soft-shadow, 0 4px 12px rgba(0, 0, 0, 0.04))",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
          <div>
            <div style={{ fontSize: "0.85rem", color: "#7d8082", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em" }}>
              Current Plan
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-on-surface, #16181d)", marginTop: "0.25rem" }}>
              {planName}
            </div>
          </div>
          <div>
            {isPro ? (
              subscription?.cancelAtPeriodEnd ? (
                <span className="badge badge-danger">Cancels at Period End</span>
              ) : (
                <span className="badge badge-pro">Active</span>
              )
            ) : (
              <span className="badge badge-free">Free Tier</span>
            )}
          </div>
        </div>

        {/* FR-17: Pending downgrade indicator */}
        {subscription?.pendingInterval && (
          <div className="alert alert-warning" style={{ marginBottom: "1.25rem" }}>
            <div>
              <strong>Pending Downgrade:</strong> Your plan will switch to Pro Monthly on{" "}
              <strong>{formatDate(subscription.pendingEffectiveAt || subscription.currentPeriodEnd)}</strong>. You retain
              full Pro Yearly access until that date.
            </div>
          </div>
        )}

        {/* FR-17: Renewal or Access Ends Date */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", padding: "1.25rem 0", borderTop: "1px solid #f1f3f5", borderBottom: "1px solid #f1f3f5" }}>
          <div>
            <div style={{ fontSize: "0.85rem", color: "#646668" }}>Account Email</div>
            <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>{userEmail}</div>
          </div>

          <div>
            <div style={{ fontSize: "0.85rem", color: "#646668" }}>
              {subscription?.cancelAtPeriodEnd ? "Access Ends On" : "Next Renewal Date"}
            </div>
            <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>
              {subscription?.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : "N/A (Free tier)"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.85rem", color: "#646668" }}>Billing Interval</div>
            <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>
              {subscription?.interval || "None"}
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem" }}>
          <Link href="/plans" className="btn btn-secondary">
            Change Plan
          </Link>

          {/* FR-18: Show Cancel control ONLY when ACTIVE and cancelAtPeriodEnd === false */}
          {isPro && subscription?.status === "ACTIVE" && !subscription.cancelAtPeriodEnd && (
            <button
              className="btn btn-outline-danger"
              onClick={() => {
                setErrorMessage(null);
                setCancelStep("CONFIRM");
              }}
            >
              Cancel Subscription
            </button>
          )}

          {/* When cancellation is scheduled, the cancel button simply disappears (FR-18, A13) */}
        </div>
      </div>

      {/* CONFIRMATION STEP MODAL (FR-19) */}
      {cancelStep === "CONFIRM" && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginTop: 0, fontSize: "1.4rem", fontWeight: 700, color: "var(--color-error, #c51707)" }}>
              Cancel Subscription?
            </h2>
            <p style={{ color: "#4b4c4e", fontSize: "0.95rem", lineHeight: 1.6 }}>
              Are you sure you want to cancel your Pro subscription?
            </p>
            <div
              style={{
                backgroundColor: "var(--color-surface-color, #f9fafb)",
                border: "1px solid var(--color-surface-variant, #e5e5e6)",
                borderRadius: "8px",
                padding: "1rem",
                margin: "1.25rem 0",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.95rem", color: "#323334" }}>
                <strong>Access retained:</strong> You will continue to have full Pro access until{" "}
                <strong>{formatDate(subscription?.currentPeriodEnd ?? null)}</strong>. No further charges will occur.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                className="btn btn-secondary"
                disabled={isSubmitting}
                onClick={() => setCancelStep("NONE")}
              >
                Keep Subscription
              </button>
              <button
                className="btn btn-danger"
                disabled={isSubmitting}
                onClick={() => setCancelStep("REASON")} // Open optional reason prompt (FR-20)
              >
                Continue to Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPTIONAL REASON CAPTURE MODAL (FR-20) */}
      {cancelStep === "REASON" && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginTop: 0, fontSize: "1.3rem", fontWeight: 700 }}>
              Help us improve (Optional)
            </h2>
            <p style={{ color: "#646668", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
              Could you let us know why you&apos;re leaving? You can skip this question if you prefer.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.25rem" }}>
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #dee2e6",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    backgroundColor: selectedReason === r.value ? "var(--color-primary-container, #ccdfff)" : "#ffffff",
                  }}
                >
                  <input
                    type="radio"
                    name="cancellationReason"
                    value={r.value}
                    checked={selectedReason === r.value}
                    onChange={(e) => setSelectedReason(e.target.value)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>

            {selectedReason === "OTHER" && (
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                  Please specify:
                </label>
                <textarea
                  value={otherReasonText}
                  onChange={(e) => setOtherReasonText(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "6px",
                    border: "1px solid #dee2e6",
                    fontFamily: "inherit",
                    fontSize: "0.9rem",
                  }}
                  placeholder="Tell us what we could do better..."
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem" }}>
              {/* Skipping the prompt is allowed (FR-20) */}
              <button
                className="btn btn-secondary"
                disabled={isSubmitting}
                onClick={() => executeCancellation(undefined, undefined)}
              >
                Skip & Confirm Cancellation
              </button>

              <button
                className="btn btn-danger"
                disabled={isSubmitting}
                onClick={() => executeCancellation(selectedReason, otherReasonText)}
              >
                {isSubmitting ? "Canceling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
