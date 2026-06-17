import type { MarkschemeNode, QuestionNodeRow, QuestionSourceRegion } from "@/types/database";

export type CompilerProviderState = "configured" | "not_configured";

export type CompilerProviderStatus = {
  smartImport: {
    status: CompilerProviderState;
    requiredEnvVars: string[];
    message: string;
  };
  ocr: {
    status: CompilerProviderState;
    requiredEnvVars: string[];
    message: string;
  };
  semanticGrouping: {
    status: CompilerProviderState;
    requiredEnvVars: string[];
    message: string;
  };
  manualFallbackAvailable: boolean;
  blockingMessages: string[];
};

export type AnswerTypeSuggestion = {
  responseMode: QuestionNodeRow["response_mode"];
  confidence: number;
  reason: string;
};

export type CompilerReviewQueueItem = {
  code:
    | "low_confidence_region"
    | "low_confidence_question"
    | "missing_marks"
    | "missing_response_type"
    | "unresolved_markscheme"
    | "suggested_answer_type";
  severity: "critical" | "warning" | "info";
  label: string;
  detail: string;
  questionNodeId?: string | null;
  sourceRegionId?: string | null;
  nodeKey?: string | null;
};

export type CompilerReadinessSummary = {
  status: "ready" | "needs_review" | "provider_missing";
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  reviewQueue: CompilerReviewQueueItem[];
  providerStatus: CompilerProviderStatus;
};

export type CompilerReadinessEnv = Partial<Record<string, string | undefined>>;

export function getCompilerProviderStatus(env: CompilerReadinessEnv = process.env): CompilerProviderStatus {
  const hasDeepSeek = hasEnv(env, "DEEPSEEK_API_KEY");
  const hasMineru = hasEnv(env, "MINERU_API_KEY") || hasEnv(env, "MINERU_WORKER_HMAC_SECRET");
  const smartImportConfigured = hasDeepSeek && hasMineru;
  const blockingMessages: string[] = [];

  if (!smartImportConfigured) {
    blockingMessages.push(
      "Provider-backed Smart Import requires DEEPSEEK_API_KEY plus MINERU_API_KEY or MINERU_WORKER_HMAC_SECRET. Manual review remains available.",
    );
  }
  if (!hasMineru) {
    blockingMessages.push("OCR/layout detection requires MINERU_API_KEY or MINERU_WORKER_HMAC_SECRET.");
  }

  return {
    smartImport: {
      status: smartImportConfigured ? "configured" : "not_configured",
      requiredEnvVars: ["DEEPSEEK_API_KEY", "MINERU_API_KEY or MINERU_WORKER_HMAC_SECRET"],
      message: smartImportConfigured
        ? "Provider-backed Smart Import is configured. Teacher review is still mandatory before publish."
        : "Provider-backed Smart Import is unavailable; use manual PDF regions, LaTeX parsing, or Advanced JSON Review.",
    },
    ocr: {
      status: hasMineru ? "configured" : "not_configured",
      requiredEnvVars: ["MINERU_API_KEY or MINERU_WORKER_HMAC_SECRET"],
      message: hasMineru
        ? "OCR/layout detection can be run through the configured MinerU path."
        : "OCR/layout detection is not configured; draw and link source regions manually.",
    },
    semanticGrouping: {
      status: hasDeepSeek ? "configured" : "not_configured",
      requiredEnvVars: ["DEEPSEEK_API_KEY"],
      message: hasDeepSeek
        ? "Semantic answer grouping may be used as a review-required assistive workflow."
        : "Semantic answer grouping is unavailable; deterministic/manual grouping remains available.",
    },
    manualFallbackAvailable: true,
    blockingMessages,
  };
}

export function inferAnswerTypeSuggestion(prompt: string | null | undefined): AnswerTypeSuggestion {
  const text = normalizePrompt(prompt);
  if (!text) {
    return {
      responseMode: "typed_or_upload",
      confidence: 0.2,
      reason: "No prompt text was available, so teacher review is required.",
    };
  }

  if (/\b(choose|select|circle|tick)\b/.test(text)) {
    return { responseMode: "multiple_choice", confidence: 0.78, reason: "Choice command term detected." };
  }
  if (/\b(draw|sketch|label|construct)\b/.test(text)) {
    return { responseMode: "upload_pdf", confidence: 0.76, reason: "Drawing or diagram command term detected." };
  }
  if (/\b(prove|show that|derive|hence show|justify)\b/.test(text)) {
    return { responseMode: "typed_or_upload", confidence: 0.82, reason: "Proof or working-heavy command term detected." };
  }
  if (/\b(calculate|determine|find|solve|evaluate)\b/.test(text)) {
    return { responseMode: "typed_or_upload", confidence: 0.76, reason: "Calculation command term detected." };
  }
  if (/\b(complete (the )?table|fill in (the )?table|table below)\b/.test(text)) {
    return { responseMode: "typed_text", confidence: 0.62, reason: "Table completion detected; current V2 fallback is typed text or upload." };
  }
  if (/\b(state|define|name|identify|write down|give)\b/.test(text)) {
    return { responseMode: "typed_text", confidence: 0.74, reason: "Short-answer command term detected." };
  }
  if (/\b(explain|discuss|describe|compare|comment|outline)\b/.test(text)) {
    return { responseMode: "typed_text", confidence: 0.68, reason: "Long-response command term detected." };
  }
  return { responseMode: "typed_or_upload", confidence: 0.45, reason: "No strong command term was detected." };
}

export function buildCompilerReviewQueue({
  questionNodes,
  sourceRegions = [],
  markschemeNodes = [],
}: {
  questionNodes: Array<Pick<QuestionNodeRow, "id" | "node_key" | "prompt_html" | "prompt_latex" | "marks" | "response_mode"> & { marks_available?: number | null }>;
  sourceRegions?: Array<Pick<QuestionSourceRegion, "id" | "question_node_id" | "node_key" | "region_type" | "confidence" | "status" | "metadata_json">>;
  markschemeNodes?: Array<Pick<MarkschemeNode, "status" | "mapped_question_node_id">>;
}): CompilerReviewQueueItem[] {
  const queue: CompilerReviewQueueItem[] = [];

  for (const region of sourceRegions) {
    if (region.status === "ignored") continue;
    if (region.status === "detected" || region.status === "needs_review" || Number(region.confidence ?? 1) < 0.8) {
      queue.push({
        code: "low_confidence_region",
        severity: Number(region.confidence ?? 0) < 0.6 ? "critical" : "warning",
        label: "Review source region",
        detail: `Region ${region.node_key ?? region.id} needs review before publish.`,
        questionNodeId: region.question_node_id,
        sourceRegionId: region.id,
        nodeKey: region.node_key,
      });
    }
  }

  for (const node of questionNodes) {
    const prompt = [node.prompt_html, node.prompt_latex].filter(Boolean).join(" ");
    const metadata = sourceRegions
      .filter((region) => region.question_node_id === node.id || (region.node_key && region.node_key === node.node_key))
      .map((region) => safeRecord(region.metadata_json));
    const hasRegionMarks = metadata.some((record) => hasPositiveNumber(record.marks));
    const hasMarks = hasPositiveNumber(node.marks) || hasPositiveNumber(node.marks_available) || hasRegionMarks;
    if (!hasMarks) {
      queue.push({
        code: "missing_marks",
        severity: "critical",
        label: "Missing marks",
        detail: `${node.node_key} needs marks from the paper, markscheme, or teacher review.`,
        questionNodeId: node.id,
        nodeKey: node.node_key,
      });
    }

    const hasRegionResponseMode = metadata.some((record) => typeof record.response_mode === "string" && record.response_mode.length > 0);
    if ((!node.response_mode || node.response_mode === "none") && !hasRegionResponseMode) {
      queue.push({
        code: "missing_response_type",
        severity: "critical",
        label: "Missing response type",
        detail: `${node.node_key} needs a teacher-confirmed answer type before publish.`,
        questionNodeId: node.id,
        nodeKey: node.node_key,
      });
    } else if (node.response_mode === "none") {
      const suggestion = inferAnswerTypeSuggestion(prompt);
      queue.push({
        code: "suggested_answer_type",
        severity: "info",
        label: "Answer type suggestion",
        detail: `${node.node_key}: suggested ${suggestion.responseMode} (${suggestion.reason})`,
        questionNodeId: node.id,
        nodeKey: node.node_key,
      });
    }

    const parseConfidence = questionConfidence(node, metadata);
    if (parseConfidence !== null && parseConfidence < 0.72) {
      queue.push({
        code: "low_confidence_question",
        severity: parseConfidence < 0.55 ? "critical" : "warning",
        label: "Review extracted question",
        detail: `${node.node_key} has low extraction confidence (${Math.round(parseConfidence * 100)}%).`,
        questionNodeId: node.id,
        nodeKey: node.node_key,
      });
    }
  }

  const unresolvedMarkscheme = markschemeNodes.filter((node) => node.status === "unmatched" || node.status === "needs_review" || !node.mapped_question_node_id);
  if (unresolvedMarkscheme.length) {
    queue.push({
      code: "unresolved_markscheme",
      severity: "critical",
      label: "Unresolved markscheme",
      detail: `${unresolvedMarkscheme.length} markscheme section(s) must be mapped, ignored, or reviewed.`,
    });
  }

  return dedupeQueue(queue);
}

export function summarizeCompilerReadiness({
  questionNodes,
  sourceRegions = [],
  markschemeNodes = [],
  env = process.env,
}: {
  questionNodes: Parameters<typeof buildCompilerReviewQueue>[0]["questionNodes"];
  sourceRegions?: Parameters<typeof buildCompilerReviewQueue>[0]["sourceRegions"];
  markschemeNodes?: Parameters<typeof buildCompilerReviewQueue>[0]["markschemeNodes"];
  env?: CompilerReadinessEnv;
}): CompilerReadinessSummary {
  const providerStatus = getCompilerProviderStatus(env);
  const reviewQueue = buildCompilerReviewQueue({ questionNodes, sourceRegions, markschemeNodes });
  const criticalCount = reviewQueue.filter((item) => item.severity === "critical").length;
  const warningCount = reviewQueue.filter((item) => item.severity === "warning").length;
  const infoCount = reviewQueue.filter((item) => item.severity === "info").length;
  const status = criticalCount || warningCount
    ? "needs_review"
    : providerStatus.smartImport.status === "not_configured"
      ? "provider_missing"
      : "ready";

  return {
    status,
    criticalCount,
    warningCount,
    infoCount,
    reviewQueue,
    providerStatus,
  };
}

function normalizePrompt(prompt: string | null | undefined) {
  return String(prompt ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasEnv(env: CompilerReadinessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) return false;
  return !["placeholder", "changeme", "change-me", "todo"].includes(value.toLowerCase());
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function questionConfidence(
  node: Pick<QuestionNodeRow, "prompt_html" | "prompt_latex">,
  regionMetadata: Record<string, unknown>[],
) {
  const candidates = [
    ...regionMetadata.map((record) => record.confidence),
    ...regionMetadata.map((record) => record.parse_confidence),
    safeRecord(node.prompt_html).confidence,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function dedupeQueue(items: CompilerReviewQueueItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.code}:${item.questionNodeId ?? ""}:${item.sourceRegionId ?? ""}:${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
