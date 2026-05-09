import { normalizedPackageSchema, type NormalizedAssessmentPackage } from "@/lib/assessment-package";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadAssessmentPackage(version: {
  normalized_package_json?: unknown;
  normalized_package_path?: string | null;
}, supabase?: SupabaseClient): Promise<{ package: NormalizedAssessmentPackage | null; error: string | null }> {
  if (version.normalized_package_json) {
    const parsed = normalizedPackageSchema.safeParse(version.normalized_package_json);
    if (parsed.success) return { package: parsed.data, error: null };
    return { package: null, error: `JSON validation failed: ${parsed.error.message}` };
  }

  if (version.normalized_package_path) {
    if (!supabase) {
      return { package: null, error: "Supabase client required for storage downloads." };
    }
    const { data, error } = await supabase.storage
      .from("assessment-packages")
      .download(version.normalized_package_path);
    
    if (error) {
      return { package: null, error: `Download failed: ${error.message}` };
    }
    
    const text = await data.text();
    try {
      const json = JSON.parse(text);
      const parsed = normalizedPackageSchema.safeParse(json);
      if (parsed.success) return { package: parsed.data, error: null };
      return { package: null, error: `Schema validation failed: ${parsed.error.message}` };
    } catch (e) {
      return { package: null, error: `Invalid JSON in package file: ${e instanceof Error ? e.message : "Parse error"}` };
    }
  }

  return { package: null, error: "No package content found in database or storage." };
}
