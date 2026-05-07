"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { KeyRound, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import {
  defaultTotpFriendlyName,
  displayTotpFriendlyName,
  mfaEnrollmentErrorMessage,
  normalizeTotpFriendlyName,
} from "@/lib/auth/mfa";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AalStatus = {
  currentLevel: string | null;
  nextLevel: string | null;
};

type TotpFactor = {
  id: string;
  friendly_name?: string | null;
  status: string;
  created_at: string;
};

type MfaOverview = AalStatus & {
  factors: TotpFactor[];
};

async function fetchMfaOverview(): Promise<MfaOverview> {
  const supabase = createSupabaseBrowserClient();
  const [aal, factors] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (aal.error) throw aal.error;
  if (factors.error) throw factors.error;
  return {
    currentLevel: aal.data.currentLevel,
    nextLevel: aal.data.nextLevel,
    factors: factors.data.all
      .filter((factor) => factor.factor_type === "totp")
      .map((factor) => ({
        id: factor.id,
        friendly_name: factor.friendly_name,
        status: factor.status,
        created_at: factor.created_at,
      })),
  };
}

export function OwnerMfaPanel() {
  const [status, setStatus] = useState<AalStatus | null>(null);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verificationFactorId, setVerificationFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [friendlyName, setFriendlyName] = useState(defaultTotpFriendlyName);

  async function refreshOverview() {
    try {
      const overview = await fetchMfaOverview();
      setStatus({ currentLevel: overview.currentLevel, nextLevel: overview.nextLevel });
      setFactors(overview.factors);
      setVerificationFactorId((current) =>
        current && overview.factors.some((factor) => factor.id === current)
          ? current
          : overview.factors.find((factor) => factor.status === "verified")?.id ?? overview.factors[0]?.id ?? null,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load MFA status.");
    }
  }

  useEffect(() => {
    let isMounted = true;
    void fetchMfaOverview()
      .then((overview) => {
        if (!isMounted) return;
        setStatus({ currentLevel: overview.currentLevel, nextLevel: overview.nextLevel });
        setFactors(overview.factors);
        setVerificationFactorId(
          overview.factors.find((factor) => factor.status === "verified")?.id ?? overview.factors[0]?.id ?? null,
        );
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
    const nextFriendlyName = normalizeTotpFriendlyName(friendlyName);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: nextFriendlyName,
      issuer: "Exam Vault",
    });
    if (error) {
      setMessage(mfaEnrollmentErrorMessage(error.message));
      return;
    }
    setFactorId(data.id);
    setVerificationFactorId(data.id);
    setQr(data.totp.qr_code);
    setMessage(`Scan the QR code for "${nextFriendlyName}", then enter the authenticator code to verify enrollment.`);
    await refreshOverview();
  }

  async function verify() {
    const supabase = createSupabaseBrowserClient();
    let activeFactorId = factorId ?? verificationFactorId;
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
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) {
      setMessage(`MFA verified, but the session could not be refreshed: ${refreshed.error.message}`);
      return;
    }
    setVerifyCode("");
    setMessage("MFA verified. Sensitive owner actions are now unlocked for this session.");
    await refreshOverview();
  }

  async function unenroll(factor: TotpFactor) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      setMessage(
        factor.status === "verified"
          ? `${error.message}. Verify MFA for this session before removing a verified authenticator.`
          : error.message,
      );
      return;
    }
    if (factorId === factor.id) {
      setFactorId(null);
      setQr(null);
    }
    if (verificationFactorId === factor.id) setVerificationFactorId(null);
    setMessage(`Removed ${displayTotpFriendlyName(factor)}.`);
    await refreshOverview();
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
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Authenticator factors are account-wide, not browser-specific. Use a distinct name when enrolling Apple
            Passwords, Google Authenticator, or another app.
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
            Current: {status?.currentLevel ?? "unknown"} · Required: aal2
          </p>
        </div>
      </div>
      <div className="rounded-md border border-[var(--border)] bg-white p-4">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Enrolled authenticators</h3>
        {factors.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">No authenticators are enrolled yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {factors.map((factor) => (
              <div
                key={factor.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{displayTotpFriendlyName(factor)}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {factor.status} · Added {new Date(factor.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button type="button" variant="danger" onClick={() => void unenroll(factor)}>
                  <Trash2 size={16} aria-hidden="true" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      {qr ? (
        <div className="rounded-md border border-[var(--border)] bg-white p-4">
          <Image className="h-48 w-48" src={qr} alt="TOTP enrollment QR code" width={192} height={192} unoptimized />
        </div>
      ) : null}
      <Field label="Authenticator name" description="Use a unique name, for example Apple Passwords or Google Authenticator. Supabase rejects duplicate names.">
        <Input
          value={friendlyName}
          autoComplete="off"
          onChange={(event) => setFriendlyName(event.target.value)}
        />
      </Field>
      {factors.length > 0 ? (
        <Field label="Authenticator to verify" description="Choose the authenticator app that generated the code you are entering.">
          <select
            className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            value={verificationFactorId ?? ""}
            onChange={(event) => setVerificationFactorId(event.target.value || null)}
          >
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {displayTotpFriendlyName(factor)} ({factor.status})
              </option>
            ))}
          </select>
        </Field>
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
