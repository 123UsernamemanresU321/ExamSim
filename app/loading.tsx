import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="page-container grid min-h-[calc(100vh-64px)] place-items-center py-12">
      <div className="rounded-lg border border-[var(--border)] bg-white p-6 text-center shadow-[var(--shadow-card)]">
        <Loader2 className="mx-auto animate-spin text-[var(--primary)]" size={24} aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Loading Exam Vault</p>
        <p className="mt-1 text-sm text-[var(--muted)]">Fetching the current workspace state.</p>
      </div>
    </main>
  );
}
