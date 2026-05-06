"use client";

import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPasskeyApiStatus } from "@/lib/passkeys";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type PasskeyAuth = {
  passkey?: {
    register?: (options?: { friendlyName?: string }) => Promise<{ error: Error | null; data?: unknown }>;
    authenticate?: () => Promise<{ error: Error | null; data?: unknown }>;
    list?: () => Promise<{ error: Error | null; data?: unknown[] }>;
    delete?: (id: string) => Promise<{ error: Error | null }>;
  };
  signInWithPasskey?: () => Promise<{ error: Error | null }>;
  registerPasskey?: (options?: { friendlyName?: string }) => Promise<{ error: Error | null }>;
};

export function PasskeySignInButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    const supabase = createSupabaseBrowserClient();
    const passkey = supabase.auth as typeof supabase.auth & PasskeyAuth;
    const status = getPasskeyApiStatus(passkey);
    if (!status.available) {
      setMessage("Passkeys are not available in this browser or Supabase client.");
      return;
    }
    const result =
      status.namespace === "auth.passkey"
        ? await passkey.passkey?.authenticate?.()
        : await passkey.signInWithPasskey?.();
    const error = result?.error ?? null;
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
    const status = getPasskeyApiStatus(passkey);
    if (!status.available) {
      setMessage("Passkeys are not available in this browser or Supabase client.");
      return;
    }
    const result =
      status.namespace === "auth.passkey"
        ? await passkey.passkey?.register?.({ friendlyName: "Exam Vault passkey" })
        : await passkey.registerPasskey?.({ friendlyName: "Exam Vault passkey" });
    const error = result?.error ?? null;
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

export function PasskeyManagementPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<unknown[]>([]);

  async function loadPasskeys() {
    const supabase = createSupabaseBrowserClient();
    const passkey = supabase.auth as typeof supabase.auth & PasskeyAuth;
    if (!passkey.passkey?.list) {
      setMessage("Passkey listing is not available in this Supabase client. Password fallback remains active.");
      return;
    }
    const { data, error } = await passkey.passkey.list();
    setPasskeys(data ?? []);
    setMessage(error?.message ?? `Loaded ${data?.length ?? 0} passkey(s).`);
  }

  return (
    <Card className="shadow-none">
      <h2 className="text-lg font-semibold">Passkey management</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        Passkeys are optional. Alias and password login stays enabled as fallback.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void loadPasskeys()}>
          <Fingerprint size={16} aria-hidden="true" />
          List passkeys
        </Button>
      </div>
      {passkeys.length ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-[var(--border)] bg-white p-3 text-xs">
          {JSON.stringify(passkeys, null, 2)}
        </pre>
      ) : null}
      {message ? <p className="mt-3 text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </Card>
  );
}
