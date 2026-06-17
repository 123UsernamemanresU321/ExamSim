"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { linkRosterEntryToStudentAccountAction } from "@/app/owner/students/actions";
import type { StudentSummary } from "@/lib/live-data";

export function LinkRosterAccountControl({
  rosterEntryId,
  linkedStudentProfileId,
  students,
}: {
  rosterEntryId: string;
  linkedStudentProfileId: string | null;
  students: StudentSummary[];
}) {
  const router = useRouter();
  const [selectedStudentId, setSelectedStudentId] = useState(linkedStudentProfileId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasLinkedUnknownAccount = Boolean(
    linkedStudentProfileId && !students.some((student) => student.id === linkedStudentProfileId),
  );
  const isDirty = selectedStudentId !== (linkedStudentProfileId ?? "");
  const selectLabel = useMemo(() => {
    if (students.length) return "Link roster number to account";
    return linkedStudentProfileId ? "Linked account unavailable" : "No student accounts yet";
  }, [linkedStudentProfileId, students.length]);

  const saveLink = () => {
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("roster_entry_id", rosterEntryId);
      formData.set("student_profile_id", selectedStudentId);
      const result = await linkRosterEntryToStudentAccountAction(formData);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  };

  return (
    <div className="grid min-w-[220px] gap-2 text-left">
      <label className="sr-only" htmlFor={`roster-account-${rosterEntryId}`}>
        {selectLabel}
      </label>
      <div className="flex items-center gap-2">
        <select
          id={`roster-account-${rosterEntryId}`}
          value={selectedStudentId}
          onChange={(event) => {
            setSelectedStudentId(event.target.value);
            setMessage(null);
          }}
          className="min-h-9 flex-1 rounded-[2px] border border-[var(--border)] bg-white px-2 text-xs text-[var(--ink)]"
          title="Connect this roster student number to an optional student account for results, feedback, and history."
        >
          <option value="">No linked account</option>
          {hasLinkedUnknownAccount ? <option value={linkedStudentProfileId ?? ""}>Linked account</option> : null}
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.display_name} ({student.login_code})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={saveLink}
          disabled={isPending || !isDirty}
          className="inline-flex min-h-9 items-center gap-1 rounded-[2px] border border-[var(--border)] bg-white px-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Link2 size={13} aria-hidden="true" />
          {isPending ? "Saving" : "Save"}
        </button>
      </div>
      <p className="text-[11px] leading-4 text-[var(--muted)]">
        {message ?? "Used for matching exam-code entries to the optional results account."}
      </p>
    </div>
  );
}
