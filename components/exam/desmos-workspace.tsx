"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export function DesmosWorkspace() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const apiKey = process.env.NEXT_PUBLIC_DESMOS_API_KEY?.trim();
  const srcDoc = useMemo(() => apiKey ? createDesmosDocument(apiKey) : "", [apiKey]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow || !isToolMessage(event.data, "exam-vault-desmos")) return;
      setStatus(event.data.status);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!apiKey) {
    return (
      <div className="grid min-h-[360px] place-items-center bg-[var(--surface-muted)] p-6 text-center text-sm leading-6 text-[var(--muted)]">
        Desmos is allowed for this session, but the deployment is missing <code>NEXT_PUBLIC_DESMOS_API_KEY</code>. Ask the owner to configure it before the exam.
      </div>
    );
  }

  return (
    <div className="relative min-h-[420px] bg-white">
      {status === "loading" ? <StatusOverlay message="Loading Desmos..." /> : null}
      {status === "error" ? <StatusOverlay danger message="Desmos could not be loaded. Check the network connection and API key." /> : null}
      <iframe
        ref={frameRef}
        title="Desmos graphing calculator"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className="h-[min(68vh,680px)] min-h-[420px] w-full border-0 bg-white"
      />
    </div>
  );
}

function createDesmosDocument(apiKey: string) {
  const scriptUrl = `https://www.desmos.com/api/v1.12/calculator.js?apiKey=${encodeURIComponent(apiKey)}`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#calculator{width:100%;height:100%;margin:0;overflow:hidden}</style>
<script src="${scriptUrl}"></script></head>
<body><div id="calculator"></div><script>
try {
  if (!window.Desmos) throw new Error("Desmos unavailable");
  window.Desmos.GraphingCalculator(document.getElementById("calculator"), {
    expressions: true, settingsMenu: false, zoomButtons: true, expressionsCollapsed: false, capExpressionSize: true
  });
  parent.postMessage({ source: "exam-vault-desmos", status: "ready" }, "*");
} catch (error) {
  parent.postMessage({ source: "exam-vault-desmos", status: "error" }, "*");
}
</script></body></html>`;
}

function isToolMessage(value: unknown, source: string): value is { source: string; status: "ready" | "error" } {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return message.source === source && (message.status === "ready" || message.status === "error");
}

function StatusOverlay({ message, danger = false }: { message: string; danger?: boolean }) {
  return <div className={`absolute inset-0 z-10 grid place-items-center p-6 text-center text-sm ${danger ? "bg-[var(--danger-bg)] text-[var(--danger)]" : "bg-[var(--surface-muted)] text-[var(--muted)]"}`}>{message}</div>;
}
