"use client";

import { useEffect, useRef, useState } from "react";

export function useServerCountdown(serverNowUtc: string, targetUtc: string | null, onExpire?: () => void) {
  const serverNowMs = Date.parse(serverNowUtc);
  const [serverEstimatedNow, setServerEstimatedNow] = useState(serverNowMs);
  const [hasExpired, setHasExpired] = useState(false);
  const onExpireRef = useRef(onExpire);
  const offsetRef = useRef<number | null>(null);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!targetUtc) return;

    // Initialize or re-sync offset only if it's missing or drifted significantly (> 5s)
    const currentLocalNow = Date.now();
    const currentLocalOffset = currentLocalNow - serverNowMs;
    if (offsetRef.current === null || Math.abs(offsetRef.current - currentLocalOffset) > 5000) {
      offsetRef.current = currentLocalOffset;
    }

    const id = window.setInterval(() => {
      if (offsetRef.current === null) return;
      
      const now = Date.now() - offsetRef.current;
      setServerEstimatedNow(now);
      
      const remaining = Date.parse(targetUtc) - now;
      if (remaining <= 0 && !hasExpired) {
        setHasExpired(true);
        onExpireRef.current?.();
      }
    }, 200); // 200ms for smoother ticking

    return () => window.clearInterval(id);
  }, [serverNowMs, targetUtc, hasExpired]);

  if (!targetUtc) {
    return { remainingMs: null, expired: true };
  }

  const remainingMs = Date.parse(targetUtc) - serverEstimatedNow;
  return { remainingMs, expired: remainingMs <= 0 };
}
