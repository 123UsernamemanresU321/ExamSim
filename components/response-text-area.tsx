"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function ResponseTextArea({
  attemptId,
  questionNodeId,
  questionNodeKey,
  stateToken,
  initialValue,
  readonly = false,
  onSaveStatusChange,
}: {
  attemptId: string;
  questionNodeId: string;
  questionNodeKey?: string;
  stateToken: string;
  initialValue: string;
  readonly?: boolean;
  onSaveStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void;
}) {
  const [text, setText] = useState(initialValue);
  const lastSavedText = useRef(initialValue);
  const timerRef = useRef<number | null>(null);
  const supabase = createSupabaseBrowserClient();

  // Update internal state if initialValue changes (e.g. from server refresh)
  useEffect(() => {
    if (initialValue !== lastSavedText.current) {
      setText(initialValue);
      lastSavedText.current = initialValue;
    }
  }, [initialValue]);

  async function saveNow(currentText: string) {
    if (currentText === lastSavedText.current) return;
    
    onSaveStatusChange?.("saving");
    try {
      await invokeEdgeFunction(supabase, "save-text-response", {
        body: {
          attempt_id: attemptId,
          question_node_id: questionNodeId,
          question_node_key: questionNodeKey,
          answer_text: currentText,
          state_token: stateToken,
        },
      });
      lastSavedText.current = currentText;
      onSaveStatusChange?.("saved");
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Autosave failed:", err);
      }
      onSaveStatusChange?.("error");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    onSaveStatusChange?.("idle");

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void saveNow(val);
    }, 2000); // Autosave after 2s of inactivity
  }

  // Final save on unmount if needed
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      // Note: Final save on unmount is tricky in modern React (Strict mode, etc.), 
      // but the 2s debounced save covers most cases.
    };
  }, []);

  return (
    <textarea
      className="paper-body min-h-32 w-full rounded-md border border-[var(--border)] bg-white p-3 text-base focus:border-[var(--primary)] focus:outline-none disabled:bg-[var(--surface-muted)]"
      value={text}
      onChange={handleChange}
      disabled={readonly}
      placeholder={readonly ? "Readonly after writing time." : "Type your answer here..."}
    />
  );
}
