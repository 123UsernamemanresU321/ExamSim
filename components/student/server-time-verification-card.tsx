"use client";

import { useEffect, useState } from "react";
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
  const [localNowUtc, setLocalNowUtc] = useState(serverNowUtc);
  useEffect(() => {
    const update = () => setLocalNowUtc(new Date().toISOString());
    const timeoutId = window.setTimeout(update, 0);
    const intervalId = window.setInterval(update, 30_000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);
  const drift = calculateServerTimeDriftStatus(serverNowUtc, localNowUtc);
  const tone = drift.status === "synced" ? "success" : drift.status === "minor_drift" ? "warning" : "danger";

  return (
    <div className={compact ? "flex items-center gap-2 text-xs text-slate-200" : "rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]"}>
      <div className="flex items-center justify-between gap-3">
        <div className={`flex items-center gap-2 font-semibold ${compact ? "text-slate-100" : "text-[var(--ink)]"}`}>
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
