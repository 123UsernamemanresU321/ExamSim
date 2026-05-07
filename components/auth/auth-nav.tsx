"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppRole } from "@/lib/constants";

type AuthNavState = {
  isLoaded: boolean;
  role: AppRole | null;
};

export function AuthNav() {
  const [state, setState] = useState<AuthNavState>({ isLoaded: false, role: null });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let isMounted = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (!user) {
        setState({ isLoaded: true, role: null });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("app_role")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const role = (profile?.app_role ?? user.app_metadata?.app_role ?? null) as AppRole | null;
      setState({ isLoaded: true, role });
    }

    void load();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void load();
    });
    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (!state.isLoaded) {
    return <span className="min-h-10 w-32 rounded-md bg-[var(--surface-muted)]" aria-hidden="true" />;
  }

  if (state.role) {
    return (
      <>
        <ButtonLink href={state.role === "owner" ? "/owner" : "/student"} variant="secondary">
          Dashboard
        </ButtonLink>
        <SignOutButton />
      </>
    );
  }

  return (
    <>
      <ButtonLink href="/login" variant="ghost">
        Log in
      </ButtonLink>
      <ButtonLink href="/owner" variant="secondary">
        Owner
      </ButtonLink>
      <ButtonLink href="/student" variant="secondary">
        Student
      </ButtonLink>
    </>
  );
}
