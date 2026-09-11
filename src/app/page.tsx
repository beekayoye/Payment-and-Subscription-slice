import { redirect } from "next/navigation";

// N1: No landing page or marketing page. Redirect immediately to Plans View.
export default function HomePage() {
  redirect("/plans");
}
