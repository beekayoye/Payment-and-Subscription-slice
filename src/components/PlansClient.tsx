"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlanId } from "@/config/plans";

interface SubscriptionDTO {
  plan: "FREE" | "PRO";
  interval: "MONTHLY" | "YEARLY" | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  pendingInterval: "MONTHLY" | "YEARLY" | null;
  pendingEffectiveAt: string | null;
}

interface PlansClientProps {
  subscription: SubscriptionDTO | null;
  isPro: boolean;
}

export function PlansClient({ subscription, isPro }: PlansClientProps) {
  const router = useRouter();
  const [modalType, setModalType] = useState<"upgrade" | "downgrade" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prorationPreview, setProrationPreview] = useState<{
    proratedAmountMinorUnits: number;
    formatted: string;
  } | null>(null);

  // Determine user's active plan id (FR-4, A16)
  let currentPlanId: PlanId = "FREE";
  if (isPro && subscription) {
    if (subscription.interval === "YEARLY") {
      currentPlanId = "PRO_YEARLY";
    } else if (subscription.interval === "MONTHLY") {
      currentPlanId = "PRO_MONTHLY";
    }
  }

  // Format dates
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const openUpgradeModal = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    setModalType("upgrade");
    try {
      const res = await fetch("/api/subscription/upgrade", { method: "GET" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to calculate proration preview");
      }
      setProrationPreview({
        proratedAmountMinorUnits: data.proratedAmountMinorUnits,
        formatted: `$${(data.proratedAmountMinorUnits / 100).toFixed(2)}`,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to load proration preview");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmUpgrade = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/subscription/upgrade", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Upgrade failed");
      }
      setModalType(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Upgrade failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDowngrade = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/subscription/downgrade", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Downgrade request failed");
      }
      setModalType(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Downgrade request failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, margin: "0 0 32px 0", letterSpacing: "-0.03em" }}>
          Subscription Plans
        </h1>
        <p style={{ color: "#646668", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
          Manage your plan status. All charges are in test mode.
        </p>
      </div>

      {errorMsg && !modalType && (
        <div className="alert alert-error">
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Exactly 3 plan cards sourced from config (FR-3) */}
      <div className="plan-grid">
        {/* 1. FREE PLAN */}
        <div className={`plan-card ${currentPlanId === "FREE" ? "current" : ""}`}>
          <div className="plan-card-header">
            <div className="plan-title">
              <span>Free</span>
              {currentPlanId === "FREE" && <span className="badge badge-free">Current Plan</span>}
            </div>
            <div className="plan-price">
              $0 <span className="plan-price-period">/ forever</span>
            </div>
            <p style={{ color: "#7d8082", fontSize: "0.9rem", margin: "0.25rem 0 0 0" }}>
              Standard access with default tier capabilities.
            </p>
          </div>

          <ul className="plan-features">
            <li>✓ Basic account access</li>
            <li>✓ Standard community features</li>
            <li>✓ Free plan flag on user record</li>
          </ul>

          <div>
            {currentPlanId === "FREE" ? (
              <button className="btn btn-secondary" style={{ width: "100%" }} disabled>
                Current Plan
              </button>
            ) : (
              <Link href="/billing" className="btn btn-secondary" style={{ width: "100%" }}>
                Manage in Billing
              </Link>
            )}
          </div>
        </div>

        {/* 2. PRO MONTHLY */}
        <div className={`plan-card ${currentPlanId === "PRO_MONTHLY" ? "current" : ""}`}>
          <div className="plan-card-header">
            <div className="plan-title">
              <span>Pro Monthly</span>
              {currentPlanId === "PRO_MONTHLY" && <span className="badge badge-pro">Current Plan</span>}
            </div>
            <div className="plan-price">
              $9.00 <span className="plan-price-period">/ month</span>
            </div>
            <p style={{ color: "#7d8082", fontSize: "0.9rem", margin: "0.25rem 0 0 0" }}>
              Full Pro tier billed on a monthly cycle.
            </p>
          </div>

          {/* Pending indicators (FR-5, FR-6) */}
          {currentPlanId === "PRO_MONTHLY" && subscription?.cancelAtPeriodEnd && (
            <div className="alert alert-warning" style={{ padding: "0.6rem 0.8rem", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Cancels on {formatDate(subscription.currentPeriodEnd)}
            </div>
          )}

          <ul className="plan-features">
            <li>✓ Pro plan flag on user record</li>
            <li>✓ Monthly billing cycle</li>
            <li>✓ Upgrade to Yearly anytime with proration</li>
          </ul>

          <div>
            {currentPlanId === "PRO_MONTHLY" ? (
              <button className="btn btn-secondary" style={{ width: "100%" }} disabled>
                Current Plan
              </button>
            ) : currentPlanId === "FREE" ? (
              <Link
                href="/checkout?plan=PRO_MONTHLY"
                className="btn btn-primary"
                style={{ width: "100%" }}
              >
                Subscribe Monthly
              </Link>
            ) : (
              /* Downgrade from Yearly -> Monthly (FR-7) */
              <button
                className="btn btn-secondary"
                style={{ width: "100%" }}
                onClick={() => {
                  setErrorMsg(null);
                  setModalType("downgrade");
                }}
              >
                Downgrade to Monthly
              </button>
            )}
          </div>
        </div>

        {/* 3. PRO YEARLY */}
        <div className={`plan-card ${currentPlanId === "PRO_YEARLY" ? "current" : ""}`}>
          <div className="plan-card-header">
            <div className="plan-title">
              <span>Pro Yearly</span>
              {currentPlanId === "PRO_YEARLY" && <span className="badge badge-pro">Current Plan</span>}
            </div>
            <div className="plan-price">
              $90.00 <span className="plan-price-period">/ year</span>
            </div>
            <p style={{ color: "var(--color-primary, #004ed4)", fontSize: "0.85rem", fontWeight: 600, margin: "0.25rem 0 0 0" }}>
              Save $18 (2 months free)
            </p>
          </div>

          {/* Pending indicators (FR-5, FR-6) */}
          {currentPlanId === "PRO_YEARLY" && subscription?.pendingInterval && (
            <div className="alert alert-warning" style={{ padding: "0.6rem 0.8rem", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Yearly — switching to Monthly on {formatDate(subscription.pendingEffectiveAt || subscription.currentPeriodEnd)}
            </div>
          )}
          {currentPlanId === "PRO_YEARLY" && !subscription?.pendingInterval && subscription?.cancelAtPeriodEnd && (
            <div className="alert alert-warning" style={{ padding: "0.6rem 0.8rem", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Cancels on {formatDate(subscription.currentPeriodEnd)}
            </div>
          )}

          <ul className="plan-features">
            <li>✓ Pro plan flag on user record</li>
            <li>✓ Annual billing cycle (best value)</li>
            <li>✓ Prorated calculation on upgrades</li>
          </ul>

          <div>
            {currentPlanId === "PRO_YEARLY" ? (
              <button className="btn btn-secondary" style={{ width: "100%" }} disabled>
                Current Plan
              </button>
            ) : currentPlanId === "FREE" ? (
              <Link
                href="/checkout?plan=PRO_YEARLY"
                className="btn btn-primary"
                style={{ width: "100%" }}
              >
                Subscribe Yearly
              </Link>
            ) : (
              /* Upgrade Monthly -> Yearly (FR-7) */
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={openUpgradeModal}
              >
                Upgrade to Yearly
              </button>
            )}
          </div>
        </div>
      </div>

      {/* UPGRADE CONFIRMATION MODAL (FR-24, FR-25) */}
      {modalType === "upgrade" && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginTop: 0, fontSize: "1.4rem", fontWeight: 700 }}>
              Upgrade to Pro Yearly
            </h2>
            <p style={{ color: "#4b4c4e", fontSize: "0.95rem" }}>
              You will be upgraded immediately from Pro Monthly ($9/mo) to Pro Yearly ($90/yr).
            </p>

            {errorMsg && (
              <div className="alert alert-error" style={{ margin: "1rem 0" }}>
                <span>{errorMsg}</span>
              </div>
            )}

            <div
              style={{
                backgroundColor: "var(--color-surface-color, #f9fafb)",
                border: "1px solid var(--color-surface-variant, #e5e5e6)",
                borderRadius: "8px",
                padding: "1rem",
                margin: "1.25rem 0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "#646668" }}>Prorated Charge Today:</span>
                <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--color-primary, #004ed4)" }}>
                  {prorationPreview ? prorationPreview.formatted : "Calculating..."}
                </span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "#7d8082", margin: 0 }}>
                Calculated based on the remaining days in your current monthly billing period.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                className="btn btn-secondary"
                disabled={isLoading}
                onClick={() => {
                  setModalType(null);
                  setErrorMsg(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={isLoading || !prorationPreview}
                onClick={handleConfirmUpgrade}
              >
                {isLoading ? "Processing..." : "Confirm & Charge Upgrade"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOWNGRADE CONFIRMATION MODAL (FR-27) */}
      {modalType === "downgrade" && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginTop: 0, fontSize: "1.4rem", fontWeight: 700 }}>
              Schedule Downgrade to Monthly
            </h2>
            <p style={{ color: "#4b4c4e", fontSize: "0.95rem" }}>
              Your Pro Yearly plan will remain active with full access until the end of your paid period on{" "}
              <strong>{formatDate(subscription?.currentPeriodEnd ?? null)}</strong>.
            </p>
            <p style={{ color: "#4b4c4e", fontSize: "0.95rem" }}>
              At renewal, your subscription will automatically switch to Pro Monthly ($9.00/month). No charge is made today.
            </p>

            {errorMsg && (
              <div className="alert alert-error" style={{ margin: "1rem 0" }}>
                <span>{errorMsg}</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                className="btn btn-secondary"
                disabled={isLoading}
                onClick={() => {
                  setModalType(null);
                  setErrorMsg(null);
                }}
              >
                Back
              </button>
              <button
                className="btn btn-primary"
                disabled={isLoading}
                onClick={handleConfirmDowngrade}
              >
                {isLoading ? "Scheduling..." : "Schedule Downgrade"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
