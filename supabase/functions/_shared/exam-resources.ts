import type { AttemptState } from "./attempt-state.ts";
import { getAdminClient } from "./supabase.ts";

type AdminClient = ReturnType<typeof getAdminClient>;

type AttemptResourceContext = {
  assessment_id: string;
  assessment_version_id: string;
  exam_policy_json?: unknown;
};

type MaterialRow = {
  id: string;
  title: string;
  material_type: string;
  object_path: string | null;
  content_html: string | null;
  visibility_policy: string;
  requirement?: string | null;
  resource_library_item_id?: string | null;
  sort_order?: number | null;
};

type ResourceRow = {
  id: string;
  owner_profile_id: string;
  object_path: string;
};

export type StudentExamResource = {
  id: string;
  title: string;
  material_type: string;
  requirement: "allowed" | "required";
  visibility_policy: string;
  content_html: string | null;
  signed_url: string | null;
  signed_url_expires_in_seconds: number | null;
};

export async function loadStudentExamResources(
  admin: AdminClient,
  attempt: AttemptResourceContext,
  state: AttemptState,
): Promise<StudentExamResource[]> {
  const { data: assessment, error: assessmentError } = await admin
    .from("assessments")
    .select("owner_profile_id")
    .eq("id", attempt.assessment_id)
    .maybeSingle();
  if (assessmentError) throw assessmentError;
  if (!assessment?.owner_profile_id) throw new Error("Assessment owner was not found");
  const assessmentOwnerId = String(assessment.owner_profile_id);

  const { data: materialRows, error: materialError } = await admin
    .from("assessment_materials")
    .select("id,title,material_type,object_path,content_html,visibility_policy,requirement,resource_library_item_id,sort_order")
    .eq("assessment_id", attempt.assessment_id)
    .eq("assessment_version_id", attempt.assessment_version_id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (materialError) throw materialError;

  const materials = (materialRows ?? []) as MaterialRow[];
  const snapshotRequirements = readSnapshotRequirements(attempt.exam_policy_json);
  const policyEligibleMaterials = materials.filter((material) => snapshotRequirements.get(material.id) !== "prohibited");
  const resourceIds = [...new Set(policyEligibleMaterials.map((item) => item.resource_library_item_id).filter((id): id is string => Boolean(id)))];
  const resourceById = new Map<string, ResourceRow>();
  if (resourceIds.length) {
    const { data: resourceRows, error: resourceError } = await admin
      .from("resource_library_items")
      .select("id,owner_profile_id,object_path")
      .in("id", resourceIds)
      .eq("owner_profile_id", assessmentOwnerId);
    if (resourceError) throw resourceError;
    for (const resource of (resourceRows ?? []) as ResourceRow[]) resourceById.set(resource.id, resource);
  }

  const visible = policyEligibleMaterials.filter((material) => isVisibleInState(material.visibility_policy, state));
  return Promise.all(visible.map(async (material) => {
    const resource = material.resource_library_item_id ? resourceById.get(material.resource_library_item_id) : null;
    const objectPath = material.resource_library_item_id
      ? resource?.object_path ?? null
      : isOwnedLegacyObjectPath(material.object_path, assessmentOwnerId)
        ? material.object_path
        : null;
    const snapshotRequirement = snapshotRequirements.get(material.id);
    const requirement = snapshotRequirement === "required" || material.requirement === "required" ? "required" : "allowed";
    let signedUrl: string | null = null;
    if (objectPath) {
      const bucket = resource ? "assessment-resources" : "assessment-sources";
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(objectPath, 300);
      if (error) throw error;
      signedUrl = data?.signedUrl ?? null;
    }
    return toStudentResource(material, requirement, signedUrl);
  }));
}

function isOwnedLegacyObjectPath(objectPath: string | null, ownerProfileId: string) {
  return Boolean(
    objectPath
      && objectPath.startsWith(`${ownerProfileId}/`)
      && !objectPath.includes(".."),
  );
}

export function toStudentResource(
  resource: MaterialRow,
  requirement: "allowed" | "required",
  signedUrl: string | null,
): StudentExamResource {
  return {
    id: resource.id,
    title: resource.title,
    material_type: resource.material_type,
    requirement,
    visibility_policy: resource.visibility_policy,
    content_html: resource.content_html,
    signed_url: signedUrl,
    signed_url_expires_in_seconds: signedUrl ? 300 : null,
  };
}

function isVisibleInState(visibility: string, state: AttemptState) {
  if (visibility === "always") return true;
  if (visibility === "before_exam") return state === "WAITING" || state === "ACTIVE" || state === "PAUSED";
  if (visibility === "active_only") return state === "ACTIVE" || state === "PAUSED";
  if (visibility === "after_finish") return state === "FINISHED_REVIEW";
  return false;
}

function readSnapshotRequirements(value: unknown) {
  const requirements = new Map<string, string>();
  if (!isRecord(value) || !Array.isArray(value.resources)) return requirements;
  for (const resource of value.resources) {
    if (!isRecord(resource)) continue;
    const assignmentId = typeof resource.assignmentId === "string" ? resource.assignmentId : null;
    const requirement = typeof resource.requirement === "string" ? resource.requirement : null;
    if (assignmentId && requirement) requirements.set(assignmentId, requirement);
  }
  return requirements;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
