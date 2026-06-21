"use client";

import { useEffect, useRef, useState } from "react";

const GEOGEBRA_DOCUMENT = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#geogebra{width:100%;height:100%;margin:0;overflow:hidden}</style>
<script src="https://www.geogebra.org/apps/deployggb.js"></script></head>
<body><div id="geogebra"></div><script>
try {
  if (!window.GGBApplet) throw new Error("GeoGebra unavailable");
  var applet = new window.GGBApplet({
    appName: "geometry",
    width: Math.max(320, window.innerWidth),
    height: Math.max(440, window.innerHeight),
    showToolBar: true,
    showAlgebraInput: true,
    showMenuBar: false,
    showResetIcon: true,
    enableRightClick: false,
    enableCAS: false,
    allowStyleBar: false,
    preventFocus: false,
    scaleContainerClass: "geogebra-container",
    autoHeight: true
  }, true);
  applet.inject("geogebra");
  parent.postMessage({ source: "exam-vault-geogebra", status: "ready" }, "*");
} catch (error) {
  parent.postMessage({ source: "exam-vault-geogebra", status: "error" }, "*");
}
</script></body></html>`;

export function GeoGebraWorkspace() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow || !isGeoGebraMessage(event.data)) return;
      setStatus(event.data.status);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="relative min-h-[440px] bg-white">
      {status === "loading" ? <StatusOverlay message="Loading GeoGebra geometry..." /> : null}
      {status === "error" ? <StatusOverlay danger message="GeoGebra could not be loaded. Check the network connection." /> : null}
      <iframe
        ref={frameRef}
        title="GeoGebra geometry workspace"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={GEOGEBRA_DOCUMENT}
        className="h-[min(68vh,680px)] min-h-[440px] w-full border-0 bg-white"
      />
    </div>
  );
}

function isGeoGebraMessage(value: unknown): value is { source: "exam-vault-geogebra"; status: "ready" | "error" } {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return message.source === "exam-vault-geogebra" && (message.status === "ready" || message.status === "error");
}

function StatusOverlay({ message, danger = false }: { message: string; danger?: boolean }) {
  return <div className={`absolute inset-0 z-10 grid place-items-center p-6 text-center text-sm ${danger ? "bg-[var(--danger-bg)] text-[var(--danger)]" : "bg-[var(--surface-muted)] text-[var(--muted)]"}`}>{message}</div>;
}
