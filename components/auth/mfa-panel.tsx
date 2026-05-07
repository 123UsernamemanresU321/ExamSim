"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AalStatus = {
  currentLevel: string | null;
  nextLevel: string | null;
};

async function fetchAalStatus() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
}

export function OwnerMfaPanel() {
  const [status, setStatus] = useState<AalStatus | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");

  async function refreshStatus() {
    try {
      setStatus(await fetchAalStatus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load MFA status.");
    }
  }

  useEffect(() => {
    let isMounted = true;
    void fetchAalStatus()
      .then((nextStatus) => {
        if (isMounted) setStatus(nextStatus);
      })
      .catch((error: unknown) => {
        if (isMounted) setMessage(error instanceof Error ? error.message : "Could not load MFA status.");
      });
    return () => {
      isMounted = false;
    };
  }, []);

  async function enroll() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) {
      setMessage(error.message);
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setMessage("Scan the QR code, then enter the authenticator code to verify enrollment.");
  }

  async function verify() {
    const supabase = createSupabaseBrowserClient();
    let activeFactorId = factorId;
    if (!activeFactorId) {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setMessage(error.message);
        return;
      }
      activeFactorId = data.totp[0]?.id ?? null;
    }
    if (!activeFactorId) {
      setMessage("No TOTP factor found. Enroll an authenticator first.");
      return;
    }
    const challenge = await supabase.auth.mfa.challenge({ factorId: activeFactorId });
    if (challenge.error) {
      setMessage(challenge.error.message);
      return;
    }
    const verified = await supabase.auth.mfa.verify({
      factorId: activeFactorId,
      challengeId: challenge.data.id,
      code: verifyCode.trim(),
    });
    if (verified.error) {
      setMessage(verified.error.message);
      return;
    }
    setVerifyCode("");
    setMessage("MFA verified. Sensitive owner actions are now unlocked for this session.");
    await refreshStatus();
  }

  return (
    <Card className="grid gap-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 text-[var(--primary)]" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold">Owner MFA</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Publishing, assignment, student creation, feedback release, and exports require AAL2.
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
            Current: {status?.currentLevel ?? "unknown"} · Required: aal2
          </p>
        </div>
      </div>
      {qr ? (
        <div className="rounded-md border border-[var(--border)] bg-white p-4">
          <Image className="h-48 w-48" src={qr} alt="TOTP enrollment QR code" width={192} height={192} unoptimized />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void enroll()}>
          <KeyRound size={16} aria-hidden="true" />
          Enroll authenticator
        </Button>
      </div>
      <Field label="Authenticator code">
        <Input value={verifyCode} inputMode="numeric" autoComplete="one-time-code" onChange={(event) => setVerifyCode(event.target.value)} />
      </Field>
      <Button type="button" onClick={() => void verify()}>
        <LockKeyhole size={16} aria-hidden="true" />
        Verify MFA for this session
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </Card>
  );
}

export function OwnerPasswordPanel() {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("new_password") ?? "");
    const currentPassword = String(form.get("current_password") ?? "");
    const supabase = createSupabaseBrowserClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (userError || !email) {
      setMessage(userError?.message ?? "Could not confirm the current owner session.");
      return;
    }
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauthError) {
      setMessage("Current password was not accepted.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error?.message ?? "Password updated.");
    if (!error) formElement.reset();
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Password</h2>
      <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
        <Field label="Current password">
          <Input name="current_password" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="New password">
          <Input name="new_password" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Button type="submit" className="justify-self-start">Change password</Button>
      </form>
      {message ? <p className="mt-3 text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </Card>
  );
}
