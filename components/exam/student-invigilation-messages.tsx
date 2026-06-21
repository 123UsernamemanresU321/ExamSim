"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export type StudentInvigilationMessage = {
  id: string;
  message_kind: "broadcast" | "private" | "system";
  sender_kind: "owner" | "student_guest" | "student_account" | "system";
  body: string;
  created_at: string;
  acknowledged_at: string | null;
};

export function StudentInvigilationMessages({
  messages,
  compact = false,
  onAcknowledge,
}: {
  messages: StudentInvigilationMessage[];
  compact?: boolean;
  onAcknowledge: (messageId: string) => Promise<void>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visibleMessages = compact ? messages.slice(0, 3) : messages;
  return (
    <section className={`${compact ? "mt-5" : ""} rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3`}>
      <div className="flex items-center gap-2">
        <Bell size={15} aria-hidden="true" className="text-[var(--primary)]" />
        <h2 className="text-sm font-semibold text-[var(--ink)]">Teacher announcements</h2>
      </div>
      {visibleMessages.length ? (
        <div className="mt-3 grid gap-2">
          {visibleMessages.map((message) => (
            <article key={message.id} className="rounded-[3px] border border-[var(--border)] bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[var(--ink)]">
                  {message.message_kind === "broadcast" ? "Broadcast" : message.message_kind === "private" ? "Direct message" : "Exam update"}
                </p>
                <time className="whitespace-nowrap font-mono text-[11px] text-[var(--subtle)]" dateTime={message.created_at}>
                  {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap leading-6 text-[var(--muted)]">{message.body}</p>
              <div className="mt-3 flex justify-end">
                {message.acknowledged_at ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={14} aria-hidden="true" /> Acknowledged</span>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pendingId === message.id}
                    onClick={async () => {
                      setPendingId(message.id);
                      try { await onAcknowledge(message.id); } finally { setPendingId(null); }
                    }}
                  >
                    {pendingId === message.id ? "Saving..." : "Acknowledge"}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Broadcasts and direct messages from your teacher will appear here.</p>
      )}
    </section>
  );
}
