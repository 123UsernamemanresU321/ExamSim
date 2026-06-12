"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { Keyboard, LayoutPanelLeft, Pin, RotateCcw, UploadCloud, WifiOff, X } from "lucide-react";
import { saveStudentExamPreference } from "@/app/student/student-actions";
import { UploadSlotCard } from "@/components/upload-slot-card";
import { Button } from "@/components/ui/button";
import type { QuestionNode } from "@/lib/assessment-package";
import type { StudentUploadCompletion } from "@/lib/student-upload-client";
import type { StudentMaterial } from "@/lib/student-experience";
import type { UploadSlot } from "@/types/database";

export type ExamLayoutMode = "standard" | "wide" | "focus";

function subscribeOnlineStatus(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerOnlineSnapshot() {
  return true;
}

export function ReconnectRecoveryBanner({ attemptId }: { attemptId: string }) {
  const online = useSyncExternalStore(subscribeOnlineStatus, getOnlineSnapshot, getServerOnlineSnapshot);
  const [lastRecoveredAt, setLastRecoveredAt] = useState<string | null>(null);

  useEffect(() => {
    function onOnline() {
      setLastRecoveredAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  if (online && !lastRecoveredAt) return null;
  return (
    <div className={`mb-4 rounded-[4px] border px-4 py-3 text-sm ${
      online ? "border-[var(--success)]/25 bg-[var(--success-bg)] text-[var(--success)]" : "border-[var(--danger)]/25 bg-[var(--danger-bg)] text-[var(--danger)]"
    }`} role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-semibold">
          {online ? <RotateCcw size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
          {online ? `Connection recovered${lastRecoveredAt ? ` at ${lastRecoveredAt}` : ""}` : "Connection lost. Uploads and autosave may need retry."}
        </span>
        <a className="font-semibold underline underline-offset-2" href={`/student/attempts/${attemptId}/recovery-status`}>
          Recovery status
        </a>
      </div>
    </div>
  );
}

export function ExamWorkspaceControls({ mode, onModeChange, toolsOpen, onToolsOpenChange }: {
  mode: ExamLayoutMode;
  onModeChange: (mode: ExamLayoutMode) => void;
  toolsOpen: boolean;
  onToolsOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 lg:inline">Workspace</span>
      {(["standard", "wide", "focus"] as ExamLayoutMode[]).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onModeChange(item)}
          className={`h-8 rounded-[2px] border px-2.5 text-xs font-semibold ${
            mode === item ? "border-white bg-white !text-[var(--sidebar)]" : "border-slate-500 text-slate-200 hover:bg-slate-700"
          }`}
        >
          {item}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onToolsOpenChange(!toolsOpen)}
        className="inline-flex h-8 items-center gap-1 rounded-[2px] border border-slate-500 px-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 xl:hidden"
      >
        <LayoutPanelLeft size={14} aria-hidden="true" />
        Tools
      </button>
    </div>
  );
}

export function UploadQueueDrawer({
  uploadNodes,
  uploadSlots,
  attemptId,
  stateToken,
  onUploadComplete,
}: {
  uploadNodes: QuestionNode[];
  uploadSlots: UploadSlot[];
  attemptId: string;
  stateToken: string;
  onUploadComplete: (completion: StudentUploadCompletion) => void;
}) {
  const uploaded = uploadSlots.filter((slot) => slot.status === "uploaded" || slot.status === "blank_placeholder").length;
  const total = uploadNodes.length;
  return (
    <details className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <UploadCloud size={16} aria-hidden="true" />
          Upload queue
        </span>
        <span className="font-mono text-xs text-[var(--muted)]">{uploaded}/{total}</span>
      </summary>
      <div className="mt-4 grid gap-3">
        {uploadNodes.map((node) => (
          <UploadSlotCard
            key={node.node_id}
            attemptId={attemptId}
            questionNodeId={node.node_id}
            questionKey={node.node_key}
            stateToken={stateToken}
            status="pending"
            slot={uploadSlots.find((slot) => slot.question_node_id === node.node_id)}
            onUploadComplete={onUploadComplete}
          />
        ))}
        {!uploadNodes.length ? <p className="text-sm text-[var(--muted)]">This attempt has no root-question PDF upload slots.</p> : null}
      </div>
    </details>
  );
}

export function KeyboardShortcutsPanel() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "?") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button type="button" variant="secondary" className="w-full justify-center text-xs" onClick={() => setOpen(true)}>
        <Keyboard size={15} aria-hidden="true" />
        Keyboard shortcuts
      </Button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Exam keyboard shortcuts">
          <div className="w-full max-w-md rounded-[4px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-popover)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Exam shortcuts</h2>
              <button type="button" className="rounded-[2px] p-2 hover:bg-[var(--surface-muted)]" onClick={() => setOpen(false)} aria-label="Close shortcuts">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              {[
                ["?", "Open shortcuts"],
                ["Esc", "Close dialogs"],
                ["Tab", "Move between controls"],
                ["Shift + Tab", "Move backward"],
                ["Browser find", "Use your browser find to locate question text"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-[3px] border border-[var(--border)] p-2">
                  <kbd className="rounded-[2px] border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs">{key}</kbd>
                  <span className="text-[var(--muted)]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function PinnedMaterialsPanel({ materials }: { materials: StudentMaterial[] }) {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  const pinnedMaterials = useMemo(() => materials.filter((material) => pinnedIds.includes(material.id)), [materials, pinnedIds]);

  function togglePin(materialId: string) {
    const next = pinnedIds.includes(materialId) ? pinnedIds.filter((id) => id !== materialId) : [...pinnedIds, materialId];
    setPinnedIds(next);
    startTransition(() => {
      void saveStudentExamPreference("pinned_material_ids", next);
    });
  }

  if (!materials.length) return null;
  return (
    <section className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Pinned materials</h2>
      <div className="mt-3 grid gap-2">
        {materials.map((material) => (
          <button
            key={material.id}
            type="button"
            onClick={() => togglePin(material.id)}
            className={`flex items-center justify-between rounded-[2px] border px-3 py-2 text-left text-xs font-semibold ${
              pinnedIds.includes(material.id) ? "border-[var(--primary)] bg-[var(--surface-panel)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-muted)]"
            }`}
          >
            {material.title}
            <Pin size={13} aria-hidden="true" />
          </button>
        ))}
      </div>
      {pinnedMaterials.length ? (
        <div className="mt-3 rounded-[3px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)]">
          {pinnedMaterials.length} material{pinnedMaterials.length === 1 ? "" : "s"} pinned for quick reference.
        </div>
      ) : null}
    </section>
  );
}
