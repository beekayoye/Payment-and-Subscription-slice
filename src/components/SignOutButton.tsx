"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignOutButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      router.push("/sign-in");
      router.refresh();
    } catch {
      router.push("/sign-in");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isLoading}
      className={className || "btn btn-secondary"}
      style={style}
    >
      {isLoading ? "Signing out..." : "Sign Out"}
    </button>
  );
}
