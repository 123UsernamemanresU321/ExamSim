"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function TelemetryListener({
  attemptId,
  attemptSessionId,
  stateToken,
}: {
  attemptId: string;
  attemptSessionId?: string;
  stateToken?: string;
}) {
  const seq = useRef(0);

  useEffect(() => {
    async function record(eventType: string, payload: Record<string, unknown> = {}) {
      seq.current += 1;
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.functions.invoke("record-attempt-event", {
          body: {
            attempt_id: attemptId,
            attempt_session_id: attemptSessionId,
            event_type: eventType,
            client_event_at: new Date().toISOString(),
            client_seq: seq.current,
            payload,
            state_token: stateToken,
          },
        });
      } catch {
        // Telemetry is best-effort in the browser; server state gates remain authoritative.
      }
    }

    const onVisibility = () =>
      record(document.visibilityState === "hidden" ? "visibility.hidden" : "visibility.visible", {
        document_visibility_state: document.visibilityState,
      });
    const onFullscreen = () => record(document.fullscreenElement ? "fullscreen.enter" : "fullscreen.exit");
    const onFocus = () => record("window.focus");
    const onBlur = () => record("window.blur");
    const onOnline = () => record("network.online");
    const onOffline = () => record("network.offline");
    const onPageHide = () => record("page.pagehide");

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pagehide", onPageHide);
    const heartbeat = window.setInterval(() => record("heartbeat"), 30_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onPageHide);
      window.clearInterval(heartbeat);
    };
  }, [attemptId, attemptSessionId, stateToken]);

  return null;
}
