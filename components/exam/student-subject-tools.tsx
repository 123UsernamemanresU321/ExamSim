"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Calculator, FlaskConical, Pause, Play, Shapes, Square, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudentAccommodationPolicy } from "@/lib/examsim/accommodations";

const DesmosWorkspace = dynamic(() => import("@/components/exam/desmos-workspace").then((module) => module.DesmosWorkspace), {
  ssr: false,
  loading: () => <ToolLoading label="Loading Desmos..." />,
});
const GeoGebraWorkspace = dynamic(() => import("@/components/exam/geogebra-workspace").then((module) => module.GeoGebraWorkspace), {
  ssr: false,
  loading: () => <ToolLoading label="Loading GeoGebra..." />,
});
const KetcherWorkspace = dynamic(() => import("@/components/exam/ketcher-workspace").then((module) => module.KetcherWorkspace), {
  ssr: false,
  loading: () => <ToolLoading label="Loading the chemistry editor..." />,
});

type ActiveTool = "tts" | "desmos" | "geogebra" | "ketcher" | null;

export function StudentSubjectTools({ policy }: { policy: StudentAccommodationPolicy }) {
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const enabled = policy.tts_allowed || policy.desmos_allowed || policy.geogebra_allowed || policy.chemistry_editor_allowed;

  if (!enabled) return null;

  return (
    <section className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]" aria-labelledby="subject-tools-heading">
      <div>
        <p id="subject-tools-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">Subject tools</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Only tools approved by your teacher are available.</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {policy.tts_allowed ? <ToolButton icon={<Volume2 size={16} aria-hidden="true" />} label="Read aloud" onClick={() => setActiveTool("tts")} /> : null}
        {policy.desmos_allowed ? <ToolButton icon={<Calculator size={16} aria-hidden="true" />} label="Desmos" onClick={() => setActiveTool("desmos")} /> : null}
        {policy.geogebra_allowed ? <ToolButton icon={<Shapes size={16} aria-hidden="true" />} label="GeoGebra" onClick={() => setActiveTool("geogebra")} /> : null}
        {policy.chemistry_editor_allowed ? <ToolButton icon={<FlaskConical size={16} aria-hidden="true" />} label="Ketcher" onClick={() => setActiveTool("ketcher")} /> : null}
      </div>
      {activeTool ? <ToolDialog tool={activeTool} onClose={() => setActiveTool(null)} /> : null}
    </section>
  );
}

function ToolButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" className="min-h-11 justify-start px-3" onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}

function ToolDialog({ tool, onClose }: { tool: Exclude<ActiveTool, null>; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const title = tool === "tts" ? "Read aloud" : tool === "desmos" ? "Desmos graphing calculator" : tool === "geogebra" ? "GeoGebra geometry" : "Ketcher chemistry editor";

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-3 md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[6px] border border-white/20 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
            {tool === "geogebra" ? <p className="mt-1 text-xs text-[var(--muted)]">Geometry tools only. CAS is disabled.</p> : null}
          </div>
          <Button type="button" variant="ghost" aria-label={`Close ${title}`} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {tool === "tts" ? <BrowserTtsControls /> : null}
          {tool === "desmos" ? <DesmosWorkspace /> : null}
          {tool === "geogebra" ? <GeoGebraWorkspace /> : null}
          {tool === "ketcher" ? <KetcherWorkspace /> : null}
        </div>
      </div>
    </div>
  );
}

function BrowserTtsControls() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const [status, setStatus] = useState("Choose text in the question paper, or read the current question.");
  const [rate, setRate] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    return () => window.speechSynthesis?.cancel();
  }, []);

  function speak() {
    const text = readCurrentQuestionText();
    if (!text) {
      setStatus("No question text was found. Select text in the paper and try again.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.onstart = () => setStatus("Reading the current question aloud.");
    utterance.onend = () => {
      setStatus("Finished reading.");
      setIsPaused(false);
    };
    utterance.onerror = () => setStatus("The browser could not read this question. Try another installed voice or browser.");
    window.speechSynthesis.speak(utterance);
  }

  function togglePause() {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setStatus("Reading resumed.");
    } else {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setStatus("Reading paused.");
    }
  }

  function stop() {
    window.speechSynthesis.cancel();
    setIsPaused(false);
    setStatus("Reading stopped.");
  }

  if (!supported) {
    return <div className="grid min-h-[260px] place-items-center bg-[var(--surface-muted)] p-6 text-center text-sm leading-6 text-[var(--muted)]">This browser does not provide the Web Speech synthesis API. Use a supported browser or ask the invigilator for the approved alternative.</div>;
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-5 p-6">
      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">
        Browser voices and pronunciation vary by device. Read-aloud does not record audio and does not use the microphone.
      </div>
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        Reading speed
        <select value={rate} onChange={(event) => setRate(Number(event.target.value))} className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
          <option value="0.75">Slow</option>
          <option value="1">Normal</option>
          <option value="1.25">Fast</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={speak}><Play size={16} aria-hidden="true" />Read current question</Button>
        <Button type="button" variant="secondary" onClick={togglePause}><Pause size={16} aria-hidden="true" />{isPaused ? "Resume" : "Pause"}</Button>
        <Button type="button" variant="secondary" onClick={stop}><Square size={15} aria-hidden="true" />Stop</Button>
      </div>
      <p className="text-sm text-[var(--muted)]" role="status">{status}</p>
    </div>
  );
}

function readCurrentQuestionText() {
  const selected = window.getSelection()?.toString().trim();
  if (selected) return selected.slice(0, 12_000);
  const element = document.elementFromPoint(window.innerWidth / 2, Math.min(240, window.innerHeight / 3))?.closest("[data-exam-question]")
    ?? document.querySelector("[data-exam-question-active='true']")
    ?? document.querySelector("[data-exam-question]");
  return element?.textContent?.replace(/\s+/g, " ").trim().slice(0, 12_000) ?? "";
}

function ToolLoading({ label }: { label: string }) {
  return <div className="grid min-h-[320px] place-items-center bg-[var(--surface-muted)] p-6 text-sm text-[var(--muted)]">{label}</div>;
}
