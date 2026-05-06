import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";

export default function BrowserModePage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="text-3xl font-semibold text-[var(--ink)]">Browser Mode limitations</h1>
        <Card className="mt-6 grid gap-4 text-sm leading-7 text-[var(--muted)]">
          <p>Browser Mode does not lock down the student device. Fullscreen, visibility, focus, network, and heartbeat events are moderation evidence only.</p>
          <p>The server remains authoritative for attempt state, content release, upload URL issuance, submission acceptance, and finalization.</p>
          <p>No exam payload is sent to the browser while an attempt is WAITING. Content release is recalculated server-side by Supabase Edge Functions.</p>
          <p>Safe Exam Browser support is a future Secure Mode and must validate Browser Exam Key and Config Key server-side.</p>
        </Card>
      </main>
    </>
  );
}
