import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ReturnClient } from "@/components/ReturnClient";

// Return View (FR-12–FR-16).
// Reminder: This view never reads plan/payment state from the URL (FR-12).
// Truth is always re-fetched server-side from the database via status polling.

export default async function CheckoutReturnPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in");
  }

  return <ReturnClient />;
}
