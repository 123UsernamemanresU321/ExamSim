"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { Cohort, CohortMember, Profile } from "@/types/database";

export function CohortManager({
  cohorts,
  students,
}: {
  cohorts: Array<{ cohort: Cohort; members: Array<{ member: CohortMember; student: Profile | null }> }>;
  students: Profile[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function createCohort(formData: FormData) {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "cohort", {
        body: {
          action: "upsert",
          name: String(formData.get("name") ?? ""),
          description: String(formData.get("description") ?? "") || null,
          student_profile_ids: formData.getAll("student_profile_ids").map(String),
        },
        requiresAal2: true,
      });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save cohort.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <form action={createCohort} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-[var(--ink)]">
          <Plus size={15} /> New cohort
        </h2>
        <div className="grid gap-4">
          <Field label="Name">
            <Input name="name" placeholder="IB Physics Group" required />
          </Field>
          <Field label="Description">
            <Textarea name="description" placeholder="Optional class notes." />
          </Field>
          <Field label="Members">
            <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-slate-50 p-2">
              {students.length === 0 ? (
                <p className="p-3 text-sm text-[var(--muted)]">Create students before creating a cohort.</p>
              ) : (
                students.map((student) => (
                  <label key={student.id} className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm">
                    <input name="student_profile_ids" type="checkbox" value={student.id} />
                    {student.display_name}
                  </label>
                ))
              )}
            </div>
          </Field>
          <Button type="submit" className="gap-2 !text-white" disabled={busy || students.length === 0}>
            <Users size={15} />
            Create cohort
          </Button>
        </div>
      </form>

      <section className="grid gap-4 md:grid-cols-2">
        {cohorts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-sm text-[var(--muted)]">
            No cohorts yet.
          </div>
        ) : (
          cohorts.map(({ cohort, members }) => (
            <article key={cohort.id} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
              <h2 className="font-semibold">{cohort.name}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{cohort.description ?? "No description"}</p>
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-[var(--subtle)]">{members.length} members</p>
              <ul className="mt-2 grid gap-1 text-sm">
                {members.map(({ member, student }) => (
                  <li key={member.id}>{student?.display_name ?? member.student_profile_id}</li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
