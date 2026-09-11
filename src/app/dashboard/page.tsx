import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";

export default async function DashboardPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/sign-in");
  }

  const displayName = user.name || user.email.split("@")[0] || "User";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--color-surface, #fcf8fa)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "var(--color-surface-container-lowest, #ffffff)",
          borderRadius: "16px",
          border: "1.5px solid var(--color-surface-variant, #e5e5e6)",
          padding: "3rem 2.5rem",
          boxShadow: "var(--shadow-medium-shadow, 2px 4px 6px 0px rgba(0, 0, 0, 0.28))",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "var(--color-primary-container, #dbe1ff)",
            color: "var(--color-primary, #004ed4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.75rem",
            fontWeight: 800,
            margin: "0 auto 1.5rem auto",
          }}
        >
          {displayName.charAt(0).toUpperCase()}
        </div>

        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "var(--color-on-surface, #1b1b1c)",
            margin: "0 0 0.5rem 0",
            letterSpacing: "-0.02em",
          }}
        >
          {displayName}
        </h1>

        <p
          style={{
            color: "var(--color-on-surface-variant, #4b4c4e)",
            fontSize: "0.95rem",
            margin: "0 0 2rem 0",
          }}
        >
          {user.email}
        </p>

        <div style={{ marginTop: "1rem" }}>
          <SignOutButton
            className="btn btn-secondary"
            style={{
              width: "100%",
              padding: "0.85rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          />
        </div>
      </div>
    </div>
  );
}
