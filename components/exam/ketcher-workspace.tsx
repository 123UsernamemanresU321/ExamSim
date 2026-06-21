"use client";

import { useMemo, useState } from "react";
import type { Ketcher } from "ketcher-core";
import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import "ketcher-react/dist/index.css";
import { Button } from "@/components/ui/button";

export function KetcherWorkspace() {
  const provider = useMemo(() => new StandaloneStructServiceProvider(), []);
  const [editor, setEditor] = useState<Ketcher | null>(null);
  const [status, setStatus] = useState<string>("Loading the self-hosted chemistry editor...");

  async function copySmiles() {
    if (!editor) return;
    try {
      const smiles = await editor.getSmiles();
      await navigator.clipboard.writeText(smiles);
      setStatus(smiles ? "SMILES copied. Paste it into your answer if the question requests a structure string." : "The canvas is empty.");
    } catch {
      setStatus("The structure could not be exported as SMILES.");
    }
  }

  async function downloadMolfile() {
    if (!editor) return;
    try {
      const molfile = await editor.getMolfile();
      const url = URL.createObjectURL(new Blob([molfile], { type: "chemical/x-mdl-molfile" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "exam-structure.mol";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("MOL file exported to this device.");
    } catch {
      setStatus("The structure could not be exported as a MOL file.");
    }
  }

  return (
    <div className="grid gap-3 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <p className="text-xs leading-5 text-[var(--muted)]" role="status">{status}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!editor} onClick={() => void copySmiles()}>Copy SMILES</Button>
          <Button type="button" variant="secondary" disabled={!editor} onClick={() => void downloadMolfile()}>Export MOL</Button>
        </div>
      </div>
      <div className="h-[min(68vh,680px)] min-h-[500px] overflow-hidden">
        <Editor
          staticResourcesUrl=""
          structServiceProvider={provider}
          disableMacromoleculesEditor
          onInit={(instance) => {
            setEditor(instance);
            setStatus("Chemistry editor ready. Structures stay in this browser unless you export them.");
          }}
          errorHandler={(message) => setStatus(message || "Ketcher reported an editor error.")}
        />
      </div>
    </div>
  );
}
