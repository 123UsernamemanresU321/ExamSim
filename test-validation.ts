import { createClient } from "@supabase/supabase-js";
import { normalizedPackageSchema } from "./lib/assessment-package.ts";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data, error } = await supabase
    .from("assessment_versions")
    .select("id, status, normalized_package_json")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error("DB Error:", error);
    return;
  }

  console.log("Validating Version:", data.id);
  console.log("Status:", data.status);
  
  const parsed = normalizedPackageSchema.safeParse(data.normalized_package_json);
  if (!parsed.success) {
    console.error("VALIDATION FAILED!");
    console.error(JSON.stringify(parsed.error.format(), null, 2));
  } else {
    console.log("VALIDATION SUCCESS!");
  }
}

run();
