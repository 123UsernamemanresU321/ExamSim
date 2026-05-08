"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttemptState } from "@/lib/constants";
import { useServerCountdown } from "@/hooks/use-server-countdown";

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function CountdownTimer({
  serverNowUtc,
  targetUtc,
  state,
  onExpire,
}: {
  serverNowUtc: string;
  targetUtc: string | null;
  state: AttemptState;
  onExpire?: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshCalled = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const handleRefresh = useCallback(() => {
    if (refreshCalled.current) return;
    refreshCalled.current = true;
    setIsRefreshing(true);
    // Add a 2s delay to avoid tight refresh loops if the server clock is slightly behind
    setTimeout(() => {
      router.refresh();
      // Reset after a long delay to allow the new page load to take over
      setTimeout(() => {
        refreshCalled.current = false;
        setIsRefreshing(false);
      }, 10000);
    }, 2000);
  }, [router]);

  const handleExpire = onExpire || handleRefresh;
  const { remainingMs } = useServerCountdown(serverNowUtc, targetUtc, handleExpire);

  if (!mounted) {
    return (
      <div className="flex items-baseline gap-3">
        <div className="h-8 w-24 rounded bg-[var(--surface-muted)] opacity-50" />
        <span className="text-sm text-[var(--muted)] opacity-30">
          {state === "WAITING" ? "until release" : state === "ACTIVE" ? "writing time" : "upload grace"}
        </span>
      </div>
    );
  }

  if (remainingMs === null) {
    return (
      <div aria-live="polite" className="text-lg font-semibold text-[var(--muted)]">
        Finished
      </div>
    );
  }

  if (remainingMs <= 0 || isRefreshing) {
    return (
      <div aria-live="polite" className="flex items-baseline gap-3">
        <span className="animate-pulse font-mono text-2xl font-semibold tabular-nums text-[var(--warning)]">
          00:00:00
        </span>
        <span className="text-sm font-medium text-[var(--warning)]">
          {isRefreshing ? "Syncing..." : "Time over"}
        </span>
      </div>
    );
  }

  return (
    <div aria-live="polite" className="flex items-baseline gap-3">
      <span className="font-mono text-2xl font-semibold tabular-nums">{formatRemaining(remainingMs)}</span>
      <span className="text-sm text-[var(--muted)]">
        {state === "WAITING" ? "until release" : state === "ACTIVE" ? "writing time" : "upload grace"}
      </span>
    </div>
  );
}
