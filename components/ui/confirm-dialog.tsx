"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  isLoading = false,
  children,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  isLoading?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(1,11,29,0.58)] p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-popover)]">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--danger-bg)] text-[var(--danger)]">
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
          </div>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" isLoading={isLoading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
