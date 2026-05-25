"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page-container grid min-h-[calc(100vh-64px)] place-items-center py-12">
      <div className="w-full max-w-xl rounded-lg border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-card)]">
        <h1 className="text-2xl font-semibold text-[var(--ink)]">Something went wrong</h1>
        <StatusMessage tone="danger" className="mt-4">
          {error.message || "The page could not load. Try again, or return to your dashboard."}
        </StatusMessage>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/" variant="secondary">Go home</ButtonLink>
        </div>
      </div>
    </main>
  );
}
