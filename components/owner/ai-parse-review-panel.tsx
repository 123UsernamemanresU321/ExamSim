"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSearch, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { AssessmentVersion, ParseJobArtifact, QuestionNodeRow } from "@/types/database";

type ReviewField = "hierarchy" | "title" | "question_text" | "marks" | "response_mode" | "topics" | "source_anchor" | "rubric";
type ReviewDecision = "accept" | "reject";
type ProposalQuestion = {
  nodeKey: string;
  parentNodeKey: string | null;
  ordinal: number;
  nodeType: "section" | "question" | "subquestion" | "part";
  title: string;
  questionText: string;
  marks: string;
  responseMode: "none" | "typed_text" | "upload_pdf" | "typed_or_upload" | "multiple_choice" | "numerical";
  topics: string;
  sourcePageStart: string;
  sourcePageEnd: string;
  sourceRegion: Record<string, unknown> | null;
  sourceConfidence: number | null;
  rubric: string;
  assets: string[];
  interaction: unknown;
};

type SuggestionState = {
  id: string;
  normalizedPackage: Record<string, unknown>;
  confidence: number;
  warnings: string[];
};

const REVIEW_FIELDS: ReviewField[] = ["hierarchy", "title", "question_text", "marks", "response_mode", "topics", "source_anchor", "rubric"];

export function AiParseReviewPanel({ version, nodes, artifacts = [] }: { version: AssessmentVersion; nodes: QuestionNodeRow[]; artifacts?: ParseJobArtifact[] }) {
  const router = useRouter();
  const [ownerNotes, setOwnerNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [corrections, setCorrections] = useState<Record<string, Partial<Record<ReviewField, string>>>>({});
  const [decisions, setDecisions] = useState<Record<string, Partial<Record<ReviewField, ReviewDecision>>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sourceText = useMemo(() => JSON.stringify({
    existing_nodes: nodes,
    parse_artifacts: artifacts.map((artifact) => ({ kind: artifact.artifact_kind, object_path: artifact.object_path, preview: artifact.content_preview })),
    markscheme: {
      source_kind: version.markscheme_source_kind,
      source_object_path: version.markscheme_source_object_path,
      global_html: version.markscheme_html,
      pdf_path: version.markscheme_pdf_path,
    },
  }, null, 2), [artifacts, nodes, version.markscheme_html, version.markscheme_pdf_path, version.markscheme_source_kind, version.markscheme_source_object_path]);
  const proposalQuestions = useMemo(() => flattenProposalQuestions(suggestion?.normalizedPackage), [suggestion]);
  const currentByKey = useMemo(() => new Map(nodes.map((node) => [node.node_key.toLowerCase(), node])), [nodes]);
  const allFieldsReviewed = proposalQuestions.length > 0 && proposalQuestions.every((question) =>
    REVIEW_FIELDS.every((field) => Boolean(decisions[question.nodeKey]?.[field])));

  async function requestSuggestion() {
    setIsSubmitting(true);
    setMessage("Requesting DeepSeek review suggestion...");
    try {
      const supabase = createSupabaseBrowserClient();
      const data = await invokeEdgeFunction<{
        suggestion?: { id: string; normalized_package_json: unknown; confidence: number; warnings_json: unknown };
      }>(supabase, "ai-parse-assessment", {
        body: { assessment_version_id: version.id, source_kind: version.source_kind, source_text: sourceText, owner_notes: ownerNotes },
        requiresAal2: true,
      });
      const saved = data?.suggestion;
      if (!saved?.id || !isRecord(saved.normalized_package_json)) throw new Error("DeepSeek did not return a reviewable structured proposal.");
      setSuggestion({
        id: saved.id,
        normalizedPackage: saved.normalized_package_json,
        confidence: Number(saved.confidence ?? 0),
        warnings: Array.isArray(saved.warnings_json) ? saved.warnings_json.map(warningText) : [],
      });
      setCorrections({});
      setDecisions({});
      setMessage("Structured proposal ready. Review and correct every critical field before applying it to this draft.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request AI parse suggestion.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function applyReviewedSuggestion() {
    if (!suggestion || !proposalQuestions.length || !allFieldsReviewed) {
      setMessage("Choose Use suggestion or Keep current for every field before applying this proposal.");
      return;
    }
    setIsSubmitting(true);
    setMessage("Applying reviewed fields through deterministic hierarchy repair...");
    try {
      const reviewedNodes = buildReviewedNodes(proposalQuestions, nodes, corrections, decisions);
      const selectedFields = proposalQuestions.flatMap((question) => REVIEW_FIELDS
        .filter((field) => decisions[question.nodeKey]?.[field] === "accept")
        .map((field) => `${question.nodeKey}:${field}`));
      const reviewedFields = proposalQuestions.flatMap((question) => REVIEW_FIELDS
        .map((field) => `${question.nodeKey}:${field}:${decisions[question.nodeKey]?.[field]}`));
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "update-question-tree", {
        body: {
          version_id: version.id,
          suggestion_id: suggestion.id,
          nodes: reviewedNodes,
          selected_fields: selectedFields,
          reviewed_fields: reviewedFields,
        },
        requiresAal2: true,
      });
      setMessage("Reviewed proposal applied to the draft. Run source coverage, rubric totals, and assessment health checks before approval.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The reviewed proposal could not be applied.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function setCorrection(nodeKey: string, field: ReviewField, value: string) {
    setCorrections((current) => ({ ...current, [nodeKey]: { ...current[nodeKey], [field]: value } }));
    setDecisions((current) => ({ ...current, [nodeKey]: { ...current[nodeKey], [field]: "accept" } }));
  }

  function setFieldDecision(nodeKey: string, field: ReviewField, value: ReviewDecision) {
    setDecisions((current) => ({ ...current, [nodeKey]: { ...current[nodeKey], [field]: value } }));
  }

  return (
    <section className="grid gap-4 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4" aria-labelledby="ai-review-heading">
      <div><h2 id="ai-review-heading" className="text-lg font-semibold">AI parse assistant</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">DeepSeek may suggest structure from reviewed MinerU artifacts. Suggestions never publish or overwrite a version automatically.</p></div>
      <Field label="Owner notes for AI"><Textarea value={ownerNotes} onChange={(event) => setOwnerNotes(event.target.value)} placeholder="Example: Section A is Q1-Q9; preserve every subquestion and mark allocation." /></Field>
      <Button type="button" variant="secondary" isLoading={isSubmitting} onClick={() => void requestSuggestion()} className="justify-self-start">{!isSubmitting ? <FileSearch size={16} aria-hidden="true" /> : null}Request DeepSeek suggestion</Button>
      {message ? <p className="rounded-[3px] border border-[var(--border)] bg-white p-3 text-sm text-[var(--muted)]" role="status">{message}</p> : null}

      {suggestion ? <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--border)] bg-white px-4 py-3"><div><h3 className="flex items-center gap-2 font-semibold text-[var(--ink)]"><GitCompareArrows size={16} aria-hidden="true" />Structured proposal review</h3><p className="mt-1 text-xs text-[var(--muted)]">{proposalQuestions.length} proposed nodes · overall confidence {Math.round(suggestion.confidence * 100)}% · {allFieldsReviewed ? "all fields reviewed" : "review decisions required"}</p></div><Button type="button" disabled={!allFieldsReviewed} isLoading={isSubmitting} onClick={() => void applyReviewedSuggestion()}><CheckCircle2 size={15} aria-hidden="true" />Apply reviewed fields</Button></div>
        {suggestion.warnings.length ? <div className="rounded-[3px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Review warnings</p><ul className="mt-2 list-disc space-y-1 pl-5">{suggestion.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div> : null}
        <div className="grid gap-4">{proposalQuestions.map((question) => {
          const current = currentByKey.get(question.nodeKey.toLowerCase());
          const value = (field: ReviewField, fallback: string) => corrections[question.nodeKey]?.[field] ?? fallback;
          const sourceAnchor = value("source_anchor", formatSourceAnchor(question.sourcePageStart, question.sourcePageEnd));
          const [sourcePageStart, sourcePageEnd] = sourceAnchor.split("-");
          return <article key={question.nodeKey} className="rounded-[4px] border border-[var(--border)] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold text-[var(--primary)]">{question.nodeKey}</p><h4 className="mt-1 font-semibold text-[var(--ink)]">{question.title || current?.title || "Untitled question"}</h4></div><span className="rounded-[2px] bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--muted)]">{current ? "compare with current draft" : "new proposed node"}</span></div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ReviewControl label="Hierarchy" nodeKey={question.nodeKey} field="hierarchy" decision={decisions[question.nodeKey]?.hierarchy} onDecision={setFieldDecision} current={current?.node_type ?? "none"}><Input value={value("hierarchy", question.parentNodeKey ?? "")} onChange={(event) => setCorrection(question.nodeKey, "hierarchy", event.target.value)} placeholder="Parent node key; blank for root" /></ReviewControl>
              <ReviewControl label="Question title" nodeKey={question.nodeKey} field="title" decision={decisions[question.nodeKey]?.title} onDecision={setFieldDecision} current={current?.title ?? "none"}><Input value={value("title", question.title)} onChange={(event) => setCorrection(question.nodeKey, "title", event.target.value)} /></ReviewControl>
              <ReviewControl className="lg:col-span-2" label="Corrected question text" nodeKey={question.nodeKey} field="question_text" decision={decisions[question.nodeKey]?.question_text} onDecision={setFieldDecision} current={current?.prompt_html ?? current?.prompt_latex ?? "none"}><Textarea rows={5} value={value("question_text", question.questionText)} onChange={(event) => setCorrection(question.nodeKey, "question_text", event.target.value)} /></ReviewControl>
              <ReviewControl label="Marks" nodeKey={question.nodeKey} field="marks" decision={decisions[question.nodeKey]?.marks} onDecision={setFieldDecision} current={current?.marks?.toString() ?? "none"}><Input type="number" min="0" step="0.5" value={value("marks", question.marks)} onChange={(event) => setCorrection(question.nodeKey, "marks", event.target.value)} /></ReviewControl>
              <ReviewControl label="Answer type" nodeKey={question.nodeKey} field="response_mode" decision={decisions[question.nodeKey]?.response_mode} onDecision={setFieldDecision} current={current?.response_mode ?? "none"}><Select value={value("response_mode", question.responseMode)} onChange={(event) => setCorrection(question.nodeKey, "response_mode", event.target.value)}><option value="none">No response</option><option value="typed_text">Typed text</option><option value="numerical">Numerical</option><option value="multiple_choice">Multiple choice</option><option value="upload_pdf">PDF upload</option><option value="typed_or_upload">Typed or upload</option></Select></ReviewControl>
              <ReviewControl label="Topics" nodeKey={question.nodeKey} field="topics" decision={decisions[question.nodeKey]?.topics} onDecision={setFieldDecision} current="Existing approved tags remain"><Input value={value("topics", question.topics)} onChange={(event) => setCorrection(question.nodeKey, "topics", event.target.value)} placeholder="Comma-separated topic tags" /></ReviewControl>
              <ReviewControl label="Source anchor" nodeKey={question.nodeKey} field="source_anchor" decision={decisions[question.nodeKey]?.source_anchor} onDecision={setFieldDecision} current={[current?.source_page_start, current?.source_page_end].filter(Boolean).join("-") || "none"}><div className="grid grid-cols-2 gap-2"><Input type="number" min="1" value={sourcePageStart ?? ""} onChange={(event) => setCorrection(question.nodeKey, "source_anchor", formatSourceAnchor(event.target.value, sourcePageEnd ?? ""))} placeholder="Start page" /><Input type="number" min="1" value={sourcePageEnd ?? ""} onChange={(event) => setCorrection(question.nodeKey, "source_anchor", formatSourceAnchor(sourcePageStart ?? "", event.target.value))} placeholder="End page" /></div></ReviewControl>
              <ReviewControl className="lg:col-span-2" label="Rubric draft" nodeKey={question.nodeKey} field="rubric" decision={decisions[question.nodeKey]?.rubric} onDecision={setFieldDecision} current={current?.markscheme_html ?? "none"}><Textarea rows={4} value={value("rubric", question.rubric)} onChange={(event) => setCorrection(question.nodeKey, "rubric", event.target.value)} placeholder="Editable M1/A1/B1/E1 or markscheme guidance" /></ReviewControl>
            </div>
          </article>;
        })}</div>
        <details className="rounded-[4px] border border-[var(--border)] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-[var(--primary)]">Advanced JSON</summary><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Debug/export view only. Normal review uses the field controls above.</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-[3px] bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(suggestion.normalizedPackage, null, 2)}</pre></details>
      </div> : null}
    </section>
  );
}

function ReviewControl({ label, nodeKey, field, decision, onDecision, current, className, children }: { label: string; nodeKey: string; field: ReviewField; decision?: ReviewDecision; onDecision: (nodeKey: string, field: ReviewField, decision: ReviewDecision) => void; current: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label className="text-xs font-semibold text-[var(--ink)]">{label}</label><div className="inline-flex overflow-hidden rounded-[3px] border border-[var(--border)]" role="group" aria-label={`${label} review decision`}><button type="button" className={`px-2 py-1 text-[11px] font-semibold ${decision === "accept" ? "bg-emerald-700 text-white" : "bg-white text-[var(--muted)]"}`} onClick={() => onDecision(nodeKey, field, "accept")}>Use suggestion</button><button type="button" className={`border-l border-[var(--border)] px-2 py-1 text-[11px] font-semibold ${decision === "reject" ? "bg-slate-700 text-white" : "bg-white text-[var(--muted)]"}`} onClick={() => onDecision(nodeKey, field, "reject")}>Keep current</button></div></div>{children}<p className="mt-1 truncate text-[11px] text-[var(--subtle)]" title={current}>Current: {current}</p></div>;
}

function flattenProposalQuestions(value?: Record<string, unknown> | null): ProposalQuestion[] {
  const questions = value && Array.isArray(value.questions) ? value.questions : [];
  const result: ProposalQuestion[] = [];
  const visit = (raw: unknown, index: number, parentNodeKey: string | null) => {
    if (!isRecord(raw)) return;
    const nodeKey = stringValue(raw.node_key) || stringValue(raw.node_id) || `${parentNodeKey ? `${parentNodeKey}.` : "Q"}${index + 1}`;
    const prompt = isRecord(raw.prompt) ? raw.prompt : {};
    const region = isRecord(raw.source_region_json) ? raw.source_region_json : {};
    result.push({
      nodeKey,
      parentNodeKey: stringValue(raw.parent_node_key) || parentNodeKey,
      ordinal: numberValue(raw.ordinal) ?? index + 1,
      nodeType: normalizeNodeType(raw.node_type),
      title: stringValue(raw.title),
      questionText: stringValue(prompt.html) || stringValue(prompt.latex) || stringValue(raw.prompt_html) || stringValue(raw.prompt_latex),
      marks: numberValue(raw.marks)?.toString() ?? "",
      responseMode: normalizeResponseMode(raw.response_mode),
      topics: readStringArray(raw.topic_tags ?? raw.tags).join(", "),
      sourcePageStart: numberValue(raw.source_page_start ?? region.page_start)?.toString() ?? "",
      sourcePageEnd: numberValue(raw.source_page_end ?? region.page_end)?.toString() ?? "",
      sourceRegion: Object.keys(region).length ? region : null,
      sourceConfidence: numberValue(raw.source_confidence ?? raw.confidence),
      rubric: stringValue(raw.markscheme_html),
      assets: readStringArray(raw.assets),
      interaction: isRecord(raw.interaction) ? raw.interaction : null,
    });
    if (Array.isArray(raw.children)) raw.children.forEach((child, childIndex) => visit(child, childIndex, nodeKey));
  };
  questions.forEach((question, index) => visit(question, index, null));
  return result;
}

function buildReviewedNodes(proposals: ProposalQuestion[], currentNodes: QuestionNodeRow[], corrections: Record<string, Partial<Record<ReviewField, string>>>, decisions: Record<string, Partial<Record<ReviewField, ReviewDecision>>>) {
  const currentByKey = new Map(currentNodes.map((node) => [node.node_key.toLowerCase(), node]));
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  const proposalKeys = new Set(proposals.map((question) => question.nodeKey.toLowerCase()));
  const reviewed = proposals.map((question) => {
    const current = currentByKey.get(question.nodeKey.toLowerCase());
    const value = (field: ReviewField, proposed: string, currentValue: string) => decisions[question.nodeKey]?.[field] === "accept" ? corrections[question.nodeKey]?.[field] ?? proposed : currentValue;
    const sourceValue = value("source_anchor", formatSourceAnchor(question.sourcePageStart, question.sourcePageEnd), formatSourceAnchor(current?.source_page_start?.toString() ?? "", current?.source_page_end?.toString() ?? ""));
    const [sourceStart, correctedEnd] = sourceValue.split("-");
    return {
      node_key: question.nodeKey,
      parent_node_key: value("hierarchy", question.parentNodeKey ?? "", current?.parent_node_id ? currentById.get(current.parent_node_id)?.node_key ?? "" : "") || null,
      ordinal: question.ordinal,
      node_type: decisions[question.nodeKey]?.hierarchy === "accept" ? question.nodeType : current?.node_type ?? question.nodeType,
      title: value("title", question.title, current?.title ?? "") || null,
      prompt_html: value("question_text", question.questionText, current?.prompt_html ?? current?.prompt_latex ?? "") || null,
      prompt_latex: null,
      marks: numberValue(value("marks", question.marks, current?.marks?.toString() ?? "")),
      response_mode: normalizeResponseMode(value("response_mode", question.responseMode, current?.response_mode ?? "typed_or_upload")),
      interaction_json: question.interaction,
      markscheme_html: value("rubric", question.rubric, current?.markscheme_html ?? "") || null,
      assets: question.assets,
      source_page_start: numberValue(sourceStart),
      source_page_end: numberValue(correctedEnd),
      topic_tags: decisions[question.nodeKey]?.topics === "accept" ? readCommaList(corrections[question.nodeKey]?.topics ?? question.topics) : [],
      source_region_json: decisions[question.nodeKey]?.source_anchor === "accept" ? question.sourceRegion : null,
      source_confidence: question.sourceConfidence,
    };
  });
  for (const current of currentNodes) {
    if (proposalKeys.has(current.node_key.toLowerCase())) continue;
    reviewed.push({
      node_key: current.node_key,
      parent_node_key: current.parent_node_id ? currentById.get(current.parent_node_id)?.node_key ?? null : null,
      ordinal: current.ordinal,
      node_type: current.node_type,
      title: current.title,
      prompt_html: current.prompt_html ?? current.prompt_latex,
      prompt_latex: null,
      marks: current.marks,
      response_mode: current.response_mode,
      interaction_json: current.interaction_json,
      markscheme_html: current.markscheme_html,
      assets: current.assets ?? [],
      source_page_start: current.source_page_start,
      source_page_end: current.source_page_end,
      topic_tags: [],
      source_region_json: null,
      source_confidence: null,
    });
  }
  return reviewed;
}

function normalizeNodeType(value: unknown): ProposalQuestion["nodeType"] {
  return value === "section" || value === "subquestion" || value === "part" ? value : "question";
}

function normalizeResponseMode(value: unknown): ProposalQuestion["responseMode"] {
  return value === "none" || value === "typed_text" || value === "upload_pdf" || value === "multiple_choice" || value === "numerical" ? value : "typed_or_upload";
}

function readCommaList(value: string) { return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 20); }
function formatSourceAnchor(start: string, end: string) { return `${start}-${end}`; }
function readStringArray(value: unknown) { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []; }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function warningText(value: unknown) { return typeof value === "string" ? value : isRecord(value) && typeof value.message === "string" ? value.message : JSON.stringify(value); }
