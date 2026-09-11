"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

type ReturnViewState =
  | "PROCESSING"
  | "SUCCESS"
  | "TIMEOUT"
  | "FAILURE"
  | "UNAUTHENTICATED";

export function ReturnClient() {
  const [viewState, setViewState] = useState<ReturnViewState>("PROCESSING");
  const [pollCount, setPollCount] = useState(0);
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    interval?: string;
    periodEnd?: string;
  } | null>(null);

  const isMountedRef = useRef(true);
  const maxAttempts = 15; // Capped at 15 attempts (30s) per FR-14

  const checkStatus = useCallback(async () => {
    try {
      // FR-12: Always fetch server truth from database via API — never trust URL parameters!
      const res = await fetch("/api/subscription/status", { cache: "no-store" });

      // A lost/invalid session is not a transient error — retrying cannot fix
      // it, and letting it fall through to the generic timeout state hides the
      // real cause from the user (G7, FR-15).
      if (res.status === 401) {
        if (isMountedRef.current) {
          setViewState("UNAUTHENTICATED");
        }
        return true; // Stop polling
      }

      if (!res.ok) {
        throw new Error(`Unable to fetch status (HTTP ${res.status})`);
      }

      const data = await res.json();
      const sub = data.subscription;
      const latestEvent = data.latestEvent;

      // FR-16: If a FAILURE payment event is recorded before ACTIVE is reached
      if (latestEvent?.eventType === "FAILURE") {
        if (isMountedRef.current) {
          setViewState("FAILURE");
        }
        return true; // Stop polling
      }

      // FR-13: If subscription reached ACTIVE state
      if (sub?.status === "ACTIVE" && data.hasPro) {
        if (isMountedRef.current) {
          setSubscriptionInfo({
            interval: sub.interval,
            periodEnd: sub.currentPeriodEnd,
          });
          setViewState("SUCCESS");
        }
        return true; // Stop polling
      }

      return false;
    } catch (err) {
      console.error("Polling check error:", err);
      return false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    let attempts = 0;
    let timerId: NodeJS.Timeout;

    const poll = async () => {
      attempts += 1;
      setPollCount(attempts);

      const resolved = await checkStatus();
      if (resolved) {
        return;
      }

      // FR-15: If polling exceeds the cap (15 attempts / 30s)
      if (attempts >= maxAttempts) {
        if (isMountedRef.current) {
          setViewState("TIMEOUT");
        }
        return;
      }

      // Poll every 2 seconds (FR-14)
      timerId = setTimeout(poll, 2000);
    };

    poll();

    return () => {
      isMountedRef.current = false;
      clearTimeout(timerId);
    };
  }, [checkStatus]);

  const handleManualRefresh = async () => {
    setViewState("PROCESSING");
    setPollCount(0);
    const resolved = await checkStatus();
    // checkStatus sets its own state when it resolves (success / failure /
    // unauthenticated); only an unresolved check falls back to TIMEOUT.
    if (!resolved) {
      setViewState("TIMEOUT");
    }
  };

  return (
    <div style={{ maxWidth: "560px", margin: "2rem auto" }}>
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid var(--color-surface-variant, #e5e5e6)",
          padding: "2.5rem 2rem",
          textAlign: "center",
          boxShadow: "var(--shadow-medium-shadow, 0 4px 16px rgba(0, 0, 0, 0.06))",
        }}
      >
        {/* 1. PROCESSING STATE (FR-14) */}
        {viewState === "PROCESSING" && (
          <div>
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "4px solid #e5e5e6",
                borderTopColor: "var(--color-primary, #004ed4)",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 1.5rem auto",
              }}
            />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
              Processing Your Payment
            </h1>
            <p style={{ color: "#646668", fontSize: "0.95rem", lineHeight: 1.6 }}>
              We are verifying your transaction with Flutterwave. This usually takes a few seconds...
            </p>
            <div style={{ color: "#97999b", fontSize: "0.8rem", marginTop: "1rem" }}>
              Verification attempt {pollCount} of {maxAttempts}
            </div>
          </div>
        )}

        {/* 2. SUCCESS STATE (FR-13) */}
        {viewState === "SUCCESS" && (
          <div>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "#d4edda",
                color: "#155724",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.75rem",
                margin: "0 auto 1.25rem auto",
                fontWeight: "bold",
              }}
            >
              ✓
            </div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "#155724" }}>
              Subscription Confirmed!
            </h1>
            <p style={{ color: "#4b4c4e", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              Your Pro {subscriptionInfo?.interval ? subscriptionInfo.interval.toLowerCase() : ""} plan has been
              activated and your entitlement is verified.
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
              <Link href="/billing" className="btn btn-primary" style={{ padding: "0.75rem 1.5rem" }}>
                Go to Billing View
              </Link>
              <Link href="/plans" className="btn btn-secondary" style={{ padding: "0.75rem 1.5rem" }}>
                View Plans
              </Link>
            </div>
          </div>
        )}

        {/* 3. TIMEOUT / TAKING LONGER THAN EXPECTED STATE (FR-15) */}
        {viewState === "TIMEOUT" && (
          <div>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "#fff3cd",
                color: "#856404",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.75rem",
                margin: "0 auto 1.25rem auto",
                fontWeight: "bold",
              }}
            >
              ⏳
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
              Payment Confirmation Is Taking Longer Than Expected
            </h1>
            <p style={{ color: "#646668", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              Flutterwave webhook confirmation hasn&apos;t arrived yet. Your payment is being processed in the background
              and entitlement will update automatically once confirmed.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "300px", margin: "0 auto" }}>
              <button onClick={handleManualRefresh} className="btn btn-primary">
                Check Status Again
              </button>
              <Link href="/billing" className="btn btn-secondary">
                Continue to Billing
              </Link>
            </div>
          </div>
        )}

        {/* 4. SESSION LOST STATE — retrying cannot help (G7) */}
        {viewState === "UNAUTHENTICATED" && (
          <div>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "#fff3cd",
                color: "#856404",
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
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
              Your Session Has Expired
            </h1>
            <p style={{ color: "#646668", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              We couldn&apos;t confirm who you are, so your payment status can&apos;t be
              shown here. Any payment you completed is safe — sign in again and your
              plan will appear on the Billing page once Flutterwave confirms it.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "300px", margin: "0 auto" }}>
              <Link href="/sign-in" className="btn btn-primary">
                Sign In Again
              </Link>
              <Link href="/billing" className="btn btn-secondary">
                Go to Billing
              </Link>
            </div>
          </div>
        )}

        {/* 5. FAILURE STATE (FR-16) */}
        {viewState === "FAILURE" && (
          <div>
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
              ✕
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--color-error, #c51707)" }}>
              Payment Unsuccessful
            </h1>
            <p style={{ color: "#646668", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              The payment transaction was declined or failed verification by Flutterwave. No charges were completed.
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
              <Link href="/plans" className="btn btn-primary">
                Return to Plans
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
