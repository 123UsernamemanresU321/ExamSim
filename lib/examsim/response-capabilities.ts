import type { QuestionNode } from "@/lib/assessment-package";
import type { Json, QuestionNodeRow } from "@/types/database";

export type ResponseCapabilityKind =
  | "none"
  | "typed_text"
  | "upload_pdf"
  | "typed_or_upload"
  | "multiple_choice"
  | "numerical"
  | "whiteboard"
  | "table"
  | "unsupported";

export type ResponseCapability = {
  kind: ResponseCapabilityKind;
  label: string;
  description: string;
  providerStatus?: "manual" | "provider" | "unavailable";
  interaction?: Record<string, unknown>;
};

type QuestionLike =
  | Pick<QuestionNode, "response_mode" | "interaction">
  | (Pick<QuestionNodeRow, "response_mode" | "interaction_json"> & { interaction?: Json | null });

const STANDARD_LABELS: Record<ResponseCapabilityKind, string> = {
  none: "No response",
  typed_text: "Typed response",
  upload_pdf: "PDF upload",
  typed_or_upload: "Typed or upload",
  multiple_choice: "Multiple choice",
  numerical: "Numerical response",
  whiteboard: "Whiteboard response",
  table: "Table response",
  unsupported: "Unsupported response",
};

export function resolveResponseCapability(question: QuestionLike): ResponseCapability {
  const interaction = readInteraction(question);
  const interactionKind = typeof interaction?.kind === "string" ? interaction.kind : "";
  if (interactionKind === "whiteboard") {
    const metadata = interaction ?? { kind: "whiteboard" };
    return {
      kind: "whiteboard",
      label: STANDARD_LABELS.whiteboard,
      description: "Student draws or writes in a simple per-question canvas. Stored as structured JSON.",
      providerStatus: readProviderStatus(metadata),
      interaction: metadata,
    };
  }
  if (interactionKind === "table") {
    const metadata = interaction ?? { kind: "table" };
    return {
      kind: "table",
      label: STANDARD_LABELS.table,
      description: "Student fills configured table cells. Stored as structured JSON.",
      providerStatus: readProviderStatus(metadata),
      interaction: metadata,
    };
  }

  const mode = question.response_mode;
  if (
    mode === "none" ||
    mode === "typed_text" ||
    mode === "upload_pdf" ||
    mode === "typed_or_upload" ||
    mode === "multiple_choice" ||
    mode === "numerical"
  ) {
    return {
      kind: mode,
      label: STANDARD_LABELS[mode],
      description: mode === "none" ? "No direct student response is expected for this node." : STANDARD_LABELS[mode],
      interaction,
    };
  }

  return {
    kind: "unsupported",
    label: STANDARD_LABELS.unsupported,
    description: "This response type is not available in the current exam renderer.",
    interaction,
  };
}

export function buildDefaultInteractionForCapability(kind: "standard" | "whiteboard" | "table") {
  if (kind === "whiteboard") {
    return {
      kind: "whiteboard",
      tools: ["pen", "eraser", "text"],
      submit_scratchpad: false,
      provider_status: "manual",
    };
  }
  if (kind === "table") {
    return {
      kind: "table",
      provider_status: "manual",
      columns: [
        { id: "c1", label: "Column 1", answer: true },
        { id: "c2", label: "Column 2", answer: true },
      ],
      rows: [
        { id: "r1", label: "Row 1", cells: {} },
        { id: "r2", label: "Row 2", cells: {} },
      ],
    };
  }
  return null;
}

export function responseCapabilityLabel(question: QuestionLike) {
  return resolveResponseCapability(question).label;
}

function readInteraction(question: QuestionLike): Record<string, unknown> | undefined {
  if ("interaction" in question && isRecord(question.interaction)) return question.interaction;
  if ("interaction_json" in question && isRecord(question.interaction_json)) return question.interaction_json;
  return undefined;
}

function readProviderStatus(interaction: Record<string, unknown>) {
  const value = interaction.provider_status;
  return value === "provider" || value === "unavailable" ? value : "manual";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
