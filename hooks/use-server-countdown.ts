"use client";

import { useEffect, useState } from "react";

export function useServerCountdown(serverNowUtc: string, targetUtc: string | null) {
  const serverNowMs = Date.parse(serverNowUtc);
  const [serverEstimatedNow, setServerEstimatedNow] = useState(serverNowMs);

  useEffect(() => {
    const localOffset = Date.now() - serverNowMs;
    const id = window.setInterval(() => setServerEstimatedNow(Date.now() - localOffset), 1000);
    return () => window.clearInterval(id);
  }, [serverNowMs]);

  if (!targetUtc) {
    return { remainingMs: null, expired: true };
  }

  const remainingMs = Date.parse(targetUtc) - serverEstimatedNow;
  return { remainingMs, expired: remainingMs <= 0 };
}
