import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1).replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = (process.env.OWNER_EMAIL || process.argv[2] || "").toLowerCase();
const defaultTimezone = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Africa/Johannesburg";

if (!url || !serviceRoleKey || !ownerEmail) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OWNER_EMAIL are required");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function temporaryPassword() {
  return `${randomBytes(18).toString("base64url")}aA1!`;
}

const password = temporaryPassword();
const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

const existing = existingUsers.users.find((user) => user.email?.toLowerCase() === ownerEmail);
const user = existing
  ? (await updateOwner(existing.id)).user
  : (await createOwner()).user;

async function createOwner() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    app_metadata: { app_role: "owner" },
    user_metadata: { display_name: "Exam Vault Owner" },
  });
  if (error || !data.user) throw error ?? new Error("Owner user was not created");
  return data;
}

async function updateOwner(userId) {
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    app_metadata: { app_role: "owner" },
    user_metadata: { display_name: "Exam Vault Owner" },
  });
  if (error || !data.user) throw error ?? new Error("Owner user was not updated");
  return data;
}

const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .upsert(
    {
      auth_user_id: user.id,
      app_role: "owner",
      display_name: "Exam Vault Owner",
      owner_profile_id: null,
    },
    { onConflict: "auth_user_id" },
  )
  .select("*")
  .single();
if (profileError) throw profileError;

const { error: settingsError } = await supabase
  .from("owner_settings")
  .upsert(
    {
      owner_profile_id: profile.id,
      owner_email: ownerEmail,
      default_timezone: defaultTimezone,
    },
    { onConflict: "owner_profile_id" },
  );
if (settingsError) throw settingsError;

const outputPath = resolve(process.cwd(), ".owner-bootstrap.local.txt");
writeFileSync(
  outputPath,
  [
    "Exam Vault owner bootstrap credentials",
    `email=${ownerEmail}`,
    `temporary_password=${password}`,
    `auth_user_id=${user.id}`,
    `profile_id=${profile.id}`,
    "Change this password after first login.",
    "",
  ].join("\n"),
  { mode: 0o600 },
);

console.log(`Owner provisioned for ${ownerEmail}`);
console.log(`Temporary credentials written to ${outputPath}`);
