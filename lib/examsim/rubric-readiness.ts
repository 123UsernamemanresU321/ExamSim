import type { QuestionNodeRow, RubricTemplate, RubricTemplateItem } from "@/types/database";

export type RubricTemplateSummary = {
  templateId: string;
  totalMarks: number;
  itemCount: number;
};

export type RubricReadinessWarning = {
  code: "rubric_total_exceeds_question_marks";
  questionNodeId: string;
  questionLabel: string;
  templateId: string;
  templateName: string;
  rubricTotal: number;
  questionMarks: number;
  message: string;
};

export function buildRubricItemsForNode(
  node: Pick<QuestionNodeRow, "id" | "node_key" | "display_label" | "title" | "prompt_latex" | "prompt_html" | "visual_asset_refs">,
  templates: Pick<RubricTemplate, "id" | "name" | "subject" | "description" | "tags">[],
  items: RubricTemplateItem[],
) {
  if (!items.length) return [];
  const haystack = [
    node.node_key,
    node.display_label,
    node.title,
    node.prompt_latex,
    node.prompt_html,
    Array.isArray(node.visual_asset_refs) ? node.visual_asset_refs.join(" ") : "",
  ].filter(Boolean).join(" ").toLowerCase();
  const nodeSubjectTokens = extractTokens(haystack);
  const rankedTemplates = templates
    .map((template) => {
      const searchable = [template.name, template.subject, template.description, ...(template.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
      const tokens = extractTokens(searchable);
      const overlap = [...tokens].filter((token) => nodeSubjectTokens.has(token)).length;
      const direct = searchable.includes(String(node.node_key).toLowerCase()) || searchable.includes(String(node.display_label ?? "").toLowerCase());
      return { template, score: direct ? overlap + 10 : overlap };
    })
    .sort((a, b) => b.score - a.score);
  const selectedTemplateIds = rankedTemplates.filter((entry) => entry.score > 0).map((entry) => entry.template.id);
  const templateIds = selectedTemplateIds.length ? selectedTemplateIds : rankedTemplates.slice(0, 1).map((entry) => entry.template.id);
  return items
    .filter((item) => templateIds.includes(item.rubric_template_id))
    .sort((a, b) => a.ordinal - b.ordinal);
}

export function summarizeRubricTemplateTotals(
  templates: Pick<RubricTemplate, "id">[],
  items: Pick<RubricTemplateItem, "rubric_template_id" | "max_marks">[],
): RubricTemplateSummary[] {
  return templates.map((template) => {
    const templateItems = items.filter((item) => item.rubric_template_id === template.id);
    return {
      templateId: template.id,
      totalMarks: templateItems.reduce((sum, item) => sum + Number(item.max_marks ?? 0), 0),
      itemCount: templateItems.length,
    };
  });
}

export function buildRubricReadinessWarnings(
  questionNodes: Pick<QuestionNodeRow, "id" | "node_key" | "display_label" | "title" | "prompt_latex" | "prompt_html" | "visual_asset_refs" | "marks">[],
  templates: Pick<RubricTemplate, "id" | "name" | "subject" | "description" | "tags">[],
  items: RubricTemplateItem[],
): RubricReadinessWarning[] {
  return questionNodes.flatMap((node) => {
    const questionMarks = Number(node.marks ?? 0);
    if (questionMarks <= 0) return [];
    const nodeItems = buildRubricItemsForNode(node, templates, items);
    const rubricTotal = nodeItems.reduce((sum, item) => sum + Number(item.max_marks ?? 0), 0);
    if (!nodeItems.length || rubricTotal <= questionMarks) return [];
    const template = templates.find((entry) => entry.id === nodeItems[0]?.rubric_template_id);
    const questionLabel = node.display_label || node.node_key;
    const templateName = template?.name ?? "Selected rubric";
    return [{
      code: "rubric_total_exceeds_question_marks" as const,
      questionNodeId: node.id,
      questionLabel,
      templateId: template?.id ?? nodeItems[0]!.rubric_template_id,
      templateName,
      rubricTotal,
      questionMarks,
      message: `${questionLabel} uses ${templateName} with ${rubricTotal} rubric mark(s), but the question maximum is ${questionMarks}.`,
    }];
  });
}

function extractTokens(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3));
}
