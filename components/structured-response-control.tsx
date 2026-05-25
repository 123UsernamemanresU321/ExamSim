"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, Hash, Square } from "lucide-react";
import { MathRenderer } from "@/components/math-renderer";
import { Badge } from "@/components/ui/badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import {
  parseStoredResponseValue,
  serializeChoiceResponse,
  serializeNumericalResponse,
} from "@/lib/response-values";
import type { QuestionNode } from "@/lib/assessment-package";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type StructuredControlProps = {
  attemptId: string;
  questionNode: QuestionNode;
  stateToken: string;
  initialValue: string;
  readonly?: boolean;
};

type Choice = {
  choice_id: string;
  content_html: string;
};

export function ChoiceResponseControl({
  attemptId,
  questionNode,
  stateToken,
  initialValue,
  readonly = false,
}: StructuredControlProps) {
  const parsed = parseStoredResponseValue(initialValue);
  const maxChoices = Math.max(1, Number(questionNode.interaction?.max_choices ?? 1));
  const isMultiSelect = maxChoices > 1;
  const choices = useMemo(() => normalizeChoices(questionNode.interaction?.choices), [questionNode.interaction?.choices]);
  const [selected, setSelected] = useState<string[]>(parsed.kind === "multiple_choice" ? parsed.choiceIds : []);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = parseStoredResponseValue(initialValue);
      if (next.kind === "multiple_choice") setSelected(next.choiceIds);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialValue]);

  async function saveChoice(nextSelected: string[]) {
    setStatus("saving");
    try {
      await invokeEdgeFunction(supabase, "save-text-response", {
        body: {
          attempt_id: attemptId,
          question_node_id: questionNode.node_id,
          question_node_key: questionNode.node_key,
          answer_text: serializeChoiceResponse(nextSelected),
          state_token: stateToken,
        },
      });
      setStatus("saved");
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Choice autosave failed:", error);
      }
      setStatus("error");
    }
  }

  function setSingleChoice(choiceId: string) {
    if (readonly) return;
    const next = [choiceId];
    setSelected(next);
    void saveChoice(next);
  }

  function toggleMultiChoice(choiceId: string, checked: boolean) {
    if (readonly) return;
    const withoutChoice = selected.filter((id) => id !== choiceId);
    const next = checked ? [...withoutChoice, choiceId].slice(0, maxChoices) : withoutChoice;
    setSelected(next);
    void saveChoice(next);
  }

  if (!choices.length) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        This multiple-choice question has no choices configured yet.
      </div>
    );
  }

  return (
    <fieldset className="mt-5 rounded-md border border-[var(--border)] bg-white p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-[var(--ink)]">
        {isMultiSelect ? <CheckSquare size={16} aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
        {isMultiSelect ? `Select up to ${maxChoices}` : "Select one answer"}
      </legend>
      <div className="mt-3 grid gap-2">
        {choices.map((choice) => {
          const isChecked = selected.includes(choice.choice_id);
          return (
            <label
              key={choice.choice_id}
              className={cn(
                "flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-[var(--border)] p-3 text-sm transition-colors",
                isChecked ? "border-[var(--primary)] bg-blue-50" : "bg-white hover:bg-[var(--surface-muted)]",
                readonly && "cursor-default opacity-80",
              )}
            >
              {isMultiSelect ? (
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--primary)]"
                  checked={isChecked}
                  disabled={readonly || (!isChecked && selected.length >= maxChoices)}
                  onChange={(event) => toggleMultiChoice(choice.choice_id, event.target.checked)}
                />
              ) : (
                <input
                  type="radio"
                  name={`choice-${questionNode.node_id}`}
                  className="mt-1 h-4 w-4 accent-[var(--primary)]"
                  checked={isChecked}
                  disabled={readonly}
                  onChange={() => setSingleChoice(choice.choice_id)}
                />
              )}
              <span className="min-w-0 flex-1 paper-body text-base text-[var(--ink)]">
                <MathRenderer html={choice.content_html} />
              </span>
            </label>
          );
        })}
      </div>
      <SaveStatusBadge status={status} />
    </fieldset>
  );
}

export function NumericalResponseControl({
  attemptId,
  questionNode,
  stateToken,
  initialValue,
  readonly = false,
}: StructuredControlProps) {
  const parsed = parseStoredResponseValue(initialValue);
  const [value, setValue] = useState(parsed.kind === "numerical" ? parsed.value : "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const lastSavedValue = useRef(value);
  const timerRef = useRef<number | null>(null);
  const supabase = createSupabaseBrowserClient();
  const interaction = questionNode.interaction ?? { kind: "numerical" };
  const unit = typeof interaction.unit === "string" ? interaction.unit : "";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = parseStoredResponseValue(initialValue);
      if (next.kind === "numerical" && next.value !== lastSavedValue.current) {
        setValue(next.value);
        lastSavedValue.current = next.value;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialValue]);

  async function saveNow(currentValue: string) {
    if (currentValue === lastSavedValue.current) return;
    setStatus("saving");
    try {
      await invokeEdgeFunction(supabase, "save-text-response", {
        body: {
          attempt_id: attemptId,
          question_node_id: questionNode.node_id,
          question_node_key: questionNode.node_key,
          answer_text: serializeNumericalResponse(currentValue),
          state_token: stateToken,
        },
      });
      lastSavedValue.current = currentValue;
      setStatus("saved");
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Numerical autosave failed:", error);
      }
      setStatus("error");
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setValue(next);
    setStatus("idle");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void saveNow(next);
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="mt-5 rounded-md border border-[var(--border)] bg-white p-4">
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        <span className="flex items-center gap-2">
          <Hash size={16} aria-hidden="true" />
          Numerical response
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={typeof interaction.min_value === "number" ? interaction.min_value : undefined}
            max={typeof interaction.max_value === "number" ? interaction.max_value : undefined}
            step={typeof interaction.step === "number" ? interaction.step : "any"}
            value={value}
            disabled={readonly}
            onChange={handleChange}
            className="h-11 w-full max-w-sm rounded-md border border-[var(--border)] bg-white px-3 text-base focus:border-[var(--primary)] focus:outline-none disabled:bg-[var(--surface-muted)]"
            placeholder="Enter a number"
          />
          {unit ? <span className="text-sm font-medium text-[var(--muted)]">{unit}</span> : null}
        </div>
      </label>
      <SaveStatusBadge status={status} />
    </div>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  return (
    <div className="mt-3">
      <Badge tone={status === "error" ? "danger" : status === "saving" ? "warning" : "success"}>
        {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Autosave failed"}
      </Badge>
    </div>
  );
}

function normalizeChoices(value: unknown): Choice[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((choice, index) => {
      const record = isRecord(choice) ? choice : {};
      const id = stringValue(record.choice_id) ?? stringValue(record.id) ?? String(index + 1);
      const content = stringValue(record.content_html) ?? stringValue(record.text) ?? stringValue(record.content) ?? `Choice ${index + 1}`;
      return { choice_id: id, content_html: content };
    })
    .filter((choice) => choice.choice_id && choice.content_html);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
