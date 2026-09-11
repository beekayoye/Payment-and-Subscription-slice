import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasProAccess } from "@/lib/entitlement";
import SignOutButton from "@/components/SignOutButton";

// Signed-in shell: auth guard + persistent current-plan header (FR-1, FR-2).
// Reads entitlement exclusively via hasProAccess() per FR-2a and Rule 2.

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/sign-in");
  }

  const subscription = await db.subscription.findUnique({
    where: { userId: user.id },
  });

  const isPro = hasProAccess(subscription);
  const planLabel =
    isPro
      ? subscription?.interval === "YEARLY"
        ? "Pro Yearly"
        : "Pro Monthly"
      : null;
  const badgeClass = "badge badge-pro";

  return (
    <div className="shell-container">
      <header className="shell-header">
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <Link
            href="/plans"
            style={{
              fontWeight: 800,
              fontSize: "1.2rem",
              color: "var(--color-primary, #004ed4)",
              textDecoration: "none",
              letterSpacing: "-0.02em",
            }}
          >
            Subscription Billing
          </Link>
          <nav className="shell-nav">
            <Link href="/plans" className="shell-nav-link">
              Plans
            </Link>
            <Link href="/billing" className="shell-nav-link">
              Billing
            </Link>
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: "0.85rem", color: "#646668" }}>{user.email}</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.2rem" }}>
              {planLabel && <span className={badgeClass}>{planLabel}</span>}
              {subscription?.cancelAtPeriodEnd && (
                <span className="badge badge-danger">Canceling</span>
              )}
              {subscription?.pendingInterval && (
                <span className="badge badge-warning">Downgrade Pending</span>
              )}
            </div>
          </div>
          <SignOutButton
            className="btn btn-secondary"
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
          />
        </div>
      </header>

      <main className="main-content">{children}</main>
    </div>
  );
}
