"use client";

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
  const handleExpire = onExpire || (() => router.refresh());
  const { remainingMs } = useServerCountdown(serverNowUtc, targetUtc, handleExpire);

  if (remainingMs === null) {
    return (
      <div aria-live="polite" className="text-lg font-semibold">
        Finished
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
