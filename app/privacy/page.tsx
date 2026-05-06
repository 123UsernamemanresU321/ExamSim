import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="text-3xl font-semibold text-[var(--ink)]">Privacy</h1>
        <Card className="mt-6 grid gap-4 text-sm leading-7 text-[var(--muted)]">
          <p>Exam Vault is designed for minimal personal information: owner account details, student display names, internal login aliases, assessment metadata, submissions, marking data, and moderation evidence.</p>
          <p>Production Browser Mode v1 is intended for students aged 13 or older. The app stores an owner attestation, not a date of birth.</p>
          <p>No marketing tracking is included in this application baseline.</p>
          <p>Assessment files, packages, uploads, and marking packets are stored in private Supabase Storage buckets. Public URLs are not used for real assessment material.</p>
          <p>This page is an engineering baseline, not legal advice. Formal school deployment or under-13 use requires legal review and a consent workflow.</p>
        </Card>
      </main>
    </>
  );
}
