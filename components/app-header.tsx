import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AuthNav } from "@/components/auth/auth-nav";

export function AppHeader() {
  return (
    <header className="h-16 border-b border-[var(--border)] bg-[rgba(246,249,255,0.94)] backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center gap-3 font-semibold text-[var(--ink)]">
          <span className="grid size-9 place-items-center rounded-md bg-[var(--primary)] text-white">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <span className="tracking-[0.16em] text-xs uppercase">Exam Vault</span>
        </Link>
        <nav aria-label="Primary navigation" className="flex items-center gap-2">
          <AuthNav />
        </nav>
      </div>
    </header>
  );
}
