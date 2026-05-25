"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" className="px-2 sm:px-3" onClick={() => void signOut()}>
      <LogOut size={16} aria-hidden="true" />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
