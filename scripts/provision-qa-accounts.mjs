import { createHmac, randomBytes, createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1).replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required");
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const outputPath = resolve(process.cwd(), ".qa-accounts.local.json");
const suffix = "exam-vault.invalid";
const now = new Date().toISOString();

const accountDefinitions = [
  { key: "owner", email: `qa.owner@${suffix}`, displayName: "QA Owner", appRole: "owner", institutionRole: null, entryPath: "/owner" },
  { key: "teacher", email: `qa.teacher@${suffix}`, displayName: "QA Teacher", appRole: "student", institutionRole: "teacher", entryPath: "/owner" },
  { key: "marker", email: `qa.marker@${suffix}`, displayName: "QA Marker", appRole: "student", institutionRole: "marker", entryPath: "/owner/marking-queue" },
  { key: "reviewer", email: `qa.reviewer@${suffix}`, displayName: "QA Reviewer", appRole: "student", institutionRole: "reviewer", entryPath: "/owner/marking-queue" },
  { key: "invigilator", email: `qa.invigilator@${suffix}`, displayName: "QA Invigilator", appRole: "student", institutionRole: "invigilator", entryPath: "/owner/exam-sessions" },
  { key: "viewer", email: `qa.viewer@${suffix}`, displayName: "QA Read-only Viewer", appRole: "student", institutionRole: "read_only", entryPath: "/owner/analytics" },
];

const studentDefinitions = [
  { key: "student_a", displayName: "QA Student A", loginCode: "QA-STU-A", studentNumber: "QA-001" },
  { key: "student_b", displayName: "QA Student B", loginCode: "QA-STU-B", studentNumber: "QA-002" },
];

const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
const usersByEmail = new Map(listed.users.flatMap((user) => user.email ? [[user.email.toLowerCase(), user]] : []));
const outputAccounts = [];

let qaOwnerProfile = null;
for (const definition of accountDefinitions) {
  const password = securePassword();
  const user = await upsertAuthUser(definition.email, password, definition.displayName, definition.appRole);
  const profile = await upsertProfile(user.id, definition.appRole, definition.displayName, qaOwnerProfile?.id ?? null);
  if (definition.key === "owner") {
    qaOwnerProfile = profile;
    const { error } = await admin.from("owner_settings").upsert({
      owner_profile_id: profile.id,
      owner_email: definition.email,
      default_timezone: "Africa/Johannesburg",
    }, { onConflict: "owner_profile_id" });
    if (error) throw error;
  } else {
    const { error } = await admin.from("institution_memberships").upsert({
      owner_profile_id: qaOwnerProfile.id,
      member_profile_id: profile.id,
      role: definition.institutionRole,
      status: "active",
      display_label: definition.displayName,
      created_by_profile_id: qaOwnerProfile.id,
    }, { onConflict: "owner_profile_id,member_profile_id,role" });
    if (error) throw error;
  }

  const mfa = await enrollTotp(definition.email, password, definition.key);
  outputAccounts.push({
    kind: definition.key === "owner" ? "owner" : "institution_member",
    role: definition.institutionRole ?? "owner_admin",
    email: definition.email,
    password,
    profile_id: profile.id,
    auth_user_id: user.id,
    entry_path: definition.entryPath,
    totp_secret: mfa.secret,
    totp_factor_id: mfa.factorId,
  });
}

if (!qaOwnerProfile) throw new Error("QA owner profile was not created");

for (const definition of studentDefinitions) {
  const password = securePassword();
  const email = `${definition.loginCode.toLowerCase()}@students.local.exam-vault`;
  const user = await upsertAuthUser(email, password, definition.displayName, "student");
  const profile = await upsertProfile(user.id, "student", definition.displayName, qaOwnerProfile.id, true);
  const activationCode = `ACT-${randomBytes(6).toString("hex").toUpperCase()}`;
  const activationHash = createHash("sha256").update(activationCode).digest("hex");

  const { error: credentialError } = await admin.from("student_credentials").upsert({
    student_profile_id: profile.id,
    login_code: definition.loginCode,
    activation_code_hash: activationHash,
    activated_at: now,
  }, { onConflict: "student_profile_id" });
  if (credentialError) throw credentialError;
  const { error: linkError } = await admin.from("owner_student_links").upsert({
    owner_profile_id: qaOwnerProfile.id,
    student_profile_id: profile.id,
    link_type: "managed_student",
  }, { onConflict: "owner_profile_id,student_profile_id,link_type" });
  if (linkError) throw linkError;
  const { error: rosterError } = await admin.from("student_roster_entries").upsert({
    owner_profile_id: qaOwnerProfile.id,
    student_profile_id: profile.id,
    student_number: definition.studentNumber,
    display_name: definition.displayName,
    class_group: "QA-V3",
    active: true,
    notes: "Synthetic QA record. Never replace with real student data.",
  }, { onConflict: "owner_profile_id,student_number" });
  if (rosterError) throw rosterError;

  outputAccounts.push({
    kind: "student",
    role: "student",
    email,
    login_code: definition.loginCode,
    student_number: definition.studentNumber,
    password,
    profile_id: profile.id,
    auth_user_id: user.id,
    entry_path: "/student",
  });
}

writeFileSync(outputPath, JSON.stringify({
  generated_at: now,
  project_url: url,
  warning: "Synthetic QA credentials. Keep local, rotate before reuse, and never commit this file.",
  qa_owner_profile_id: qaOwnerProfile.id,
  accounts: outputAccounts,
}, null, 2) + "\n", { mode: 0o600 });
chmodSync(outputPath, 0o600);

console.log(`Provisioned ${outputAccounts.length} synthetic QA accounts.`);
console.log(`Credentials written to ${outputPath}`);

async function upsertAuthUser(email, password, displayName, appRole) {
  const existing = usersByEmail.get(email.toLowerCase());
  const attributes = {
    email,
    password,
    email_confirm: true,
    app_metadata: { app_role: appRole },
    user_metadata: { display_name: displayName, synthetic_qa: true },
  };
  const { data, error } = existing
    ? await admin.auth.admin.updateUserById(existing.id, attributes)
    : await admin.auth.admin.createUser(attributes);
  if (error || !data.user) throw error ?? new Error(`Could not provision ${email}`);
  usersByEmail.set(email.toLowerCase(), data.user);
  return data.user;
}

async function upsertProfile(authUserId, appRole, displayName, ownerProfileId, attestStudent = false) {
  const row = {
    auth_user_id: authUserId,
    app_role: appRole,
    display_name: displayName,
    owner_profile_id: ownerProfileId,
    ...(attestStudent ? {
      student_13_plus_attested_at: now,
      student_13_plus_attested_by_profile_id: qaOwnerProfile?.id ?? null,
    } : {}),
  };
  const { data, error } = await admin.from("profiles").upsert(row, { onConflict: "auth_user_id" }).select("*").single();
  if (error) throw error;
  return data;
}

async function enrollTotp(email, password, label) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `QA ${label} ${Date.now()}`,
  });
  if (enrollError) throw enrollError;
  const secret = enrolled.totp.secret;
  const code = totpCode(secret);
  const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code });
  if (verifyError) throw verifyError;
  await client.auth.signOut({ scope: "local" });
  return { factorId: enrolled.id, secret };
}

function securePassword() {
  return `${randomBytes(18).toString("base64url")}aA1!`;
}

function totpCode(base32Secret, timestamp = Date.now()) {
  const key = decodeBase32(base32Secret);
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}
