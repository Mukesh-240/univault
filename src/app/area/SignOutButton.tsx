"use client";
/** A button that ends the session and opens the sign-in page, so the person can choose a different role. */
import { useState } from "react";
import { post } from "@/components/api";

export function SignOutButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="secondary" disabled={busy} onClick={async () => { setBusy(true); await post("/api/auth/signout", {}); window.location.assign("/signin"); }}>{label}</button>
  );
}
