import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("V3 private assessment resource delivery", () => {
  it("issues owner-scoped signed upload URLs through an AAL2 authoring boundary", () => {
    const path = "supabase/functions/owner-issue-resource-upload/index.ts";
    expect(existsSync(path)).toBe(true);
    const source = read(path);
    expect(source).toContain('requireInstitutionAal2(request, "assessment_authoring")');
    expect(source).toContain('.from("assessment-resources").createSignedUploadUrl');
    expect(source).toContain("`${ownerProfileId}/resources/${crypto.randomUUID()}.pdf`");
    expect(source).toContain("owner-resource-upload:owner");
  });

  it("confirms server-verified bytes and hashes instead of trusting client metadata", () => {
    const path = "supabase/functions/owner-confirm-resource-upload/index.ts";
    expect(existsSync(path)).toBe(true);
    const source = read(path);
    expect(source).toContain('verifyPrivatePdfUpload(admin, "assessment-resources"');
    expect(source).toContain("verified.sha256");
    expect(source).toContain("file_size_bytes: verified.byteLength");
    expect(source).toContain("page_count: verified.pageCount");
    expect(source).not.toContain("file_size_bytes: body.file_size_bytes");
    expect(source).not.toContain("sha256: body.sha256");
  });

  it("delivers authenticated resources only through a checked attempt-state boundary", () => {
    const path = "supabase/functions/get-attempt-resources/index.ts";
    expect(existsSync(path)).toBe(true);
    const source = read(path);
    expect(source).toContain("requireUser(request)");
    expect(source).toContain("computeAttemptState");
    expect(source).toContain("assignee_profile_id");
    expect(source).toContain("loadStudentExamResources");
  });

  it("delivers guest resources only after guest-token and state verification", () => {
    const path = "supabase/functions/guest-get-attempt-resources/index.ts";
    expect(existsSync(path)).toBe(true);
    const source = read(path);
    expect(source).toContain("verifyGuestAttemptToken");
    expect(source).toContain("computeAttemptState");
    expect(source).toContain("loadStudentExamResources");
  });

  it("deploys guest resource delivery without platform JWT and retains app-level guest verification", () => {
    const config = read("supabase/config.toml");
    const guest = read("supabase/functions/guest-get-attempt-resources/index.ts");
    expect(config).toContain("[functions.guest-get-attempt-resources]\nverify_jwt = false");
    expect(guest).toContain("verifyGuestAttemptToken");
  });

  it("signs eligible resources for five minutes without returning private object paths", () => {
    const source = read("supabase/functions/_shared/exam-resources.ts");
    expect(source).toContain("createSignedUrl(objectPath, 300)");
    expect(source).toContain('.from("assessments")');
    expect(source).toContain('.select("owner_profile_id")');
    expect(source).toContain('.eq("owner_profile_id", assessmentOwnerId)');
    expect(source).toContain("isOwnedLegacyObjectPath");
    expect(source).toContain("const objectPath = material.resource_library_item_id");
    expect(source).toContain("resource?.object_path ?? null");
    expect(source).toContain('snapshotRequirements.get(material.id) !== "prohibited"');
    expect(source).not.toContain('.eq("status", "active")');
    expect(source).toContain("toStudentResource");
    expect(source).not.toContain("object_path: objectPath");
    expect(source).not.toContain("object_path: resource.object_path");
  });

  it("enforces owner-scoped resource and curriculum references in the database", () => {
    const migration = read("supabase/migrations/20260623083500_enforce_private_resource_owner_scope.sql");
    expect(migration).toContain("validate_resource_library_owner_scope");
    expect(migration).toContain("validate_assessment_material_resource_scope");
    expect(migration).toContain("validate_curriculum_source_owner_scope");
    expect(migration).toContain("validate_curriculum_standard_source_scope");
    expect(migration).toContain("Resource object path is outside its owner scope");
    expect(migration).toContain("Assessment resource belongs to another owner");
  });

  it("lets authorized workspace managers archive resources without changing immutable provenance", () => {
    const migration = read("supabase/migrations/20260623090000_fix_resource_manager_rls.sql");
    expect(migration).toContain("institution_resource_library_insert");
    expect(migration).toContain("institution_resource_library_update");
    expect(migration).toContain("new.owner_profile_id <> old.owner_profile_id");
    expect(migration).toContain("new.created_by_profile_id <> old.created_by_profile_id");
    expect(migration).toContain("institution_curriculum_source_update");
  });
});
