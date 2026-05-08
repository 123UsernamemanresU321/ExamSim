import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizedPackageSchema, type NormalizedAssessmentPackage } from "@/lib/assessment-package";

export async function loadAssessmentPackage(version: {
  normalized_package_json?: any;
  normalized_package_path?: string | null;
}) {
  if (version.normalized_package_json) {
    const parsed = normalizedPackageSchema.safeParse(version.normalized_package_json);
    if (parsed.success) return parsed.data;
  }

  if (version.normalized_package_path) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from("assessment-packages")
      .download(version.normalized_package_path);
    
    if (error) {
      console.error("Failed to download assessment package:", error);
      return null;
    }
    
    const text = await data.text();
    try {
      const json = JSON.parse(text);
      const parsed = normalizedPackageSchema.safeParse(json);
      return parsed.success ? parsed.data : null;
    } catch (e) {
      console.error("Failed to parse assessment package JSON:", e);
      return null;
    }
  }

  return null;
}
