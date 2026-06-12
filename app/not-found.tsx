import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="page-container grid min-h-screen place-items-center py-12">
      <div className="w-full max-w-xl rounded-[4px] border border-[var(--border)] bg-white p-6 text-center shadow-[var(--shadow-card)]">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--subtle)]">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          This route does not exist, or the current account does not have access to it.
        </p>
        <div className="mt-5">
          <ButtonLink href="/">Return to Exam Vault</ButtonLink>
        </div>
      </div>
    </main>
  );
}
