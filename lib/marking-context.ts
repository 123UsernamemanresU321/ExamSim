import { getOwnerAttemptReviewWorkspace } from "@/lib/live-data";
import { buildRootQuestionMarkingContext, type RootQuestionMarkingContext } from "@/lib/marking-context-core";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AttemptAccommodation, AttemptIncident, MistakeCategory, MistakeInstance, TopicTag } from "@/types/database";

export type { RootQuestionMarkingContext };
export { buildRootQuestionMarkingContext };

export async function getRootQuestionMarkingContext({
  attemptId,
  rootQuestionNodeId,
}: {
  attemptId: string;
  rootQuestionNodeId?: string | null;
}): Promise<RootQuestionMarkingContext> {
  const workspace = await getOwnerAttemptReviewWorkspace(attemptId);
  const supabase = await createSupabaseServerClient();
  const [{ data: incidents }, { data: accommodations }, { data: mistakeCategories }, { data: mistakeInstances }, { data: topicTags }] = await Promise.all([
    supabase.from("attempt_incidents").select("*").eq("attempt_id", attemptId).order("created_at", { ascending: false }),
    supabase.from("attempt_accommodations").select("*").eq("attempt_id", attemptId).order("applied_at", { ascending: false }),
    supabase.from("mistake_categories").select("*").order("name"),
    supabase.from("mistake_instances").select("*").eq("attempt_id", attemptId).order("created_at", { ascending: false }),
    supabase.from("topic_tags").select("*").order("subject").order("tag"),
  ]);

  return buildRootQuestionMarkingContext(workspace, rootQuestionNodeId, {
    incidents: (incidents ?? []) as AttemptIncident[],
    accommodations: (accommodations ?? []) as AttemptAccommodation[],
    mistakeCategories: (mistakeCategories ?? []) as MistakeCategory[],
    mistakeInstances: (mistakeInstances ?? []) as MistakeInstance[],
    topicTags: (topicTags ?? []) as TopicTag[],
  });
}
