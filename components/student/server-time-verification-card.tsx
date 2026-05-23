"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calculateServerTimeDriftStatus } from "@/lib/student-experience-core";

export function ServerTimeVerificationCard({
  serverNowUtc,
  timezone,
  compact = false,
}: {
  serverNowUtc: string;
  timezone: string;
  compact?: boolean;
}) {
  const localNowUtc = useMemo(() => new Date().toISOString(), []);
  const drift = calculateServerTimeDriftStatus(serverNowUtc, localNowUtc);
  const tone = drift.status === "synced" ? "success" : drift.status === "minor_drift" ? "warning" : "danger";

  return (
    <div className={compact ? "flex items-center gap-2 text-xs" : "rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-[var(--ink)]">
          <Clock size={compact ? 14 : 18} aria-hidden="true" />
          Server time
        </div>
        <Badge tone={tone}>{drift.status.replaceAll("_", " ")}</Badge>
      </div>
      {compact ? null : (
        <div className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
          <p>Official: {new Date(serverNowUtc).toLocaleString("en-ZA", { timeZone: timezone })}</p>
          <p>Device: {new Date(localNowUtc).toLocaleString("en-ZA")}</p>
          <p>{drift.message}</p>
        </div>
      )}
    </div>
  );
}
