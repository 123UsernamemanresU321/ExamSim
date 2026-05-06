"use client";

import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type PasskeyAuth = {
  signInWithPasskey?: () => Promise<{ error: Error | null }>;
  registerPasskey?: (options?: { friendlyName?: string }) => Promise<{ error: Error | null }>;
};

export function PasskeySignInButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    const supabase = createSupabaseBrowserClient();
    const passkey = supabase.auth as typeof supabase.auth & PasskeyAuth;
    if (!passkey.signInWithPasskey) {
      setMessage("Passkeys are not available in this browser or Supabase client.");
      return;
    }
    const { error } = await passkey.signInWithPasskey();
    if (error) {
      setMessage(error.message);
      return;
    }
    router.replace("/student");
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="secondary" onClick={() => void signIn()}>
        <Fingerprint size={16} aria-hidden="true" />
        Sign in with passkey beta
      </Button>
      {message ? <p className="text-xs leading-5 text-[var(--muted)]" role="status">{message}</p> : null}
    </div>
  );
}

export function PasskeyEnrollmentPanel() {
  const [message, setMessage] = useState<string | null>(null);

  async function enroll() {
    const supabase = createSupabaseBrowserClient();
    const passkey = supabase.auth as typeof supabase.auth & PasskeyAuth;
    if (!passkey.registerPasskey) {
      setMessage("Passkeys are not available in this browser or Supabase client.");
      return;
    }
    const { error } = await passkey.registerPasskey({ friendlyName: "Exam Vault passkey" });
    setMessage(error?.message ?? "Passkey registered. Password login remains available as fallback.");
  }

  return (
    <Card className="shadow-none">
      <h2 className="text-lg font-semibold">Passkey beta</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        Optional passkeys can be enrolled after activation. This uses Supabase experimental passkey support and keeps
        alias/password login as fallback.
      </p>
      <Button className="mt-4" type="button" variant="secondary" onClick={() => void enroll()}>
        <Fingerprint size={16} aria-hidden="true" />
        Register passkey
      </Button>
      {message ? <p className="mt-3 text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </Card>
  );
}
