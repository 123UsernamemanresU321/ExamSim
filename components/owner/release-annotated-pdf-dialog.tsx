"use client";

import { Button } from "@/components/ui/button";

export function ReleaseAnnotatedPdfDialog({
  open,
  isSaving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Release annotated PDF">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-popover)]">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Release annotated work?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This releases student-visible annotations and feedback through the existing secure feedback flow. Draft/private annotations remain hidden.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" isLoading={isSaving} onClick={onConfirm}>
            {isSaving ? "Releasing..." : "Release to student"}
          </Button>
        </div>
      </div>
    </div>
  );
}
