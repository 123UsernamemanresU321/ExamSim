"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteRosterEntryAction, deleteStudentAccountAction } from "@/app/owner/students/actions";
import type { StudentDeleteActionResult } from "@/app/owner/students/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DangerMenu, DangerMenuItem } from "@/components/ui/danger-menu";

export function DeleteStudentAccountButton({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  return (
    <DeleteStudentControl
      label="Delete student account"
      title="Delete student account?"
      description={`This removes ${studentName}'s optional results account if it has no exam attempts. Exam records are never deleted by this action.`}
      confirmLabel="Delete account"
      onConfirm={() => deleteStudentAccountAction(studentId)}
    />
  );
}

export function DeleteRosterEntryButton({
  rosterEntryId,
  studentNumber,
}: {
  rosterEntryId: string;
  studentNumber: string;
}) {
  return (
    <DeleteStudentControl
      label="Delete roster number"
      title="Delete roster number?"
      description={`This removes roster number ${studentNumber} if it has not been used for any exam attempts. Used student numbers are kept for receipts and audit history.`}
      confirmLabel="Delete roster number"
      onConfirm={() => deleteRosterEntryAction(rosterEntryId)}
    />
  );
}

function DeleteStudentControl({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<StudentDeleteActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirm = () => {
    setError(null);
    setIsDeleting(true);
    void onConfirm()
      .then((result) => {
        if (result.ok) {
          setOpen(false);
          return;
        }
        setError(result.message);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "The delete request failed."))
      .finally(() => setIsDeleting(false));
  };

  return (
    <>
      <DangerMenu label={label}>
        <DangerMenuItem
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          <Trash2 size={14} aria-hidden="true" />
          {label}
        </DangerMenuItem>
      </DangerMenu>
      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        isLoading={isDeleting}
        onCancel={() => {
          if (!isDeleting) setOpen(false);
        }}
        onConfirm={confirm}
      >
        {error ? (
          <div className="rounded-[4px] border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
            {error}
          </div>
        ) : (
          <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm leading-6 text-[var(--muted)]">
            This action is blocked automatically if the record is connected to exam history.
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
