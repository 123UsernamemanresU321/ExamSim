import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

describe("student group RLS", () => {
  it("uses a non-recursive membership helper for student group reads", () => {
    const migration = readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .reverse()
      .map((file) => readFileSync(join(migrationsDirectory, file), "utf8"))
      .find((sql) => sql.includes("private.student_is_group_member"));

    expect(migration).toBeDefined();
    expect(migration).toContain("create schema if not exists private");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain('drop policy if exists "student reads own groups" on public.student_groups');
    expect(migration).toContain("using (private.student_is_group_member(id))");
  });
});
