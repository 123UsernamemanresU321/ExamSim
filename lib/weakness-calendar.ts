import type { CalendarRecommendation, Mark, QuestionNodeRow, QuestionTopicLink, TopicTag } from "@/types/database";

export type WeakTopicInput = {
  ownerProfileId: string;
  studentProfileId: string;
  assessmentId: string;
  paperCode: string | null;
  questionNodes: Pick<QuestionNodeRow, "id" | "marks">[];
  marks: Pick<Mark, "question_node_id" | "awarded_marks">[];
  topicLinks: Pick<QuestionTopicLink, "question_node_id" | "topic_tag_id" | "weight">[];
  topicTags: Pick<TopicTag, "id" | "tag" | "subject">[];
  threshold?: number;
};

export function generateWeaknessRecommendations(input: WeakTopicInput): Array<Pick<CalendarRecommendation, "owner_profile_id" | "student_profile_id" | "assessment_id" | "paper_code" | "topic_tag_id" | "reason" | "priority" | "suggested_minutes" | "status">> {
  const threshold = input.threshold ?? 0.6;
  const marksByNode = new Map(input.marks.filter((mark) => mark.question_node_id).map((mark) => [mark.question_node_id!, Number(mark.awarded_marks)]));
  const nodeById = new Map(input.questionNodes.map((node) => [node.id, node]));
  const topicById = new Map(input.topicTags.map((tag) => [tag.id, tag]));
  const aggregate = new Map<string, { awarded: number; available: number; weight: number }>();

  for (const link of input.topicLinks) {
    const node = nodeById.get(link.question_node_id);
    if (!node || !link.topic_tag_id) continue;
    const available = Number(node.marks ?? 0) * Number(link.weight ?? 1);
    if (available <= 0) continue;
    const awarded = Number(marksByNode.get(node.id) ?? 0) * Number(link.weight ?? 1);
    const current = aggregate.get(link.topic_tag_id) ?? { awarded: 0, available: 0, weight: 0 };
    current.awarded += awarded;
    current.available += available;
    current.weight += Number(link.weight ?? 1);
    aggregate.set(link.topic_tag_id, current);
  }

  return [...aggregate.entries()]
    .filter(([, total]) => total.available > 0 && total.awarded / total.available < threshold)
    .map(([topicTagId, total]) => {
      const tag = topicById.get(topicTagId);
      const percentage = Math.round((total.awarded / total.available) * 100);
      return {
        owner_profile_id: input.ownerProfileId,
        student_profile_id: input.studentProfileId,
        assessment_id: input.assessmentId,
        paper_code: input.paperCode,
        topic_tag_id: topicTagId,
        reason: `Review ${tag ? `${tag.subject}: ${tag.tag}` : "this topic"} (${percentage}% on tagged marks).`,
        priority: percentage < 35 ? "high" : percentage < 50 ? "medium" : "low",
        suggested_minutes: percentage < 35 ? 60 : 45,
        status: "pending",
      } satisfies Pick<CalendarRecommendation, "owner_profile_id" | "student_profile_id" | "assessment_id" | "paper_code" | "topic_tag_id" | "reason" | "priority" | "suggested_minutes" | "status">;
    });
}
