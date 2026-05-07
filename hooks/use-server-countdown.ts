"use client";

import { useEffect, useRef, useState } from "react";

export function useServerCountdown(serverNowUtc: string, targetUtc: string | null, onExpire?: () => void) {
  const serverNowMs = Date.parse(serverNowUtc);
  const [serverEstimatedNow, setServerEstimatedNow] = useState(serverNowMs);
  const [hasExpired, setHasExpired] = useState(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!targetUtc) return;

    const localOffset = Date.now() - serverNowMs;
    const id = window.setInterval(() => {
      const now = Date.now() - localOffset;
      setServerEstimatedNow(now);
      
      const remaining = Date.parse(targetUtc) - now;
      if (remaining <= 0 && !hasExpired) {
        setHasExpired(true);
        onExpireRef.current?.();
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [serverNowMs, targetUtc, hasExpired]);

  if (!targetUtc) {
    return { remainingMs: null, expired: true };
  }

  const remainingMs = Date.parse(targetUtc) - serverEstimatedNow;
  return { remainingMs, expired: remainingMs <= 0 };
}
