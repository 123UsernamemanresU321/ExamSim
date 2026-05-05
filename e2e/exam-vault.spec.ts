import { expect, test } from "@playwright/test";

test("public landing explains browser mode and private release", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /secure, institutional-grade timed exam simulation/i })).toBeVisible();
  await expect(page.getByText(/tamper-evident, not tamper-proof/i)).toBeVisible();
  await expect(page.getByText(/No public buckets/i)).toBeVisible();
});

test("student waiting screen shows metadata only", async ({ page }) => {
  await page.goto("/student/attempts/att_waiting/waiting");
  await expect(page.getByRole("heading", { name: /waiting room/i })).toBeVisible();
  await expect(page.getByText(/no hidden exam payload/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /IB-style Physics Paper 2/i })).toBeVisible();
});

test("active exam screen renders content and response tools", async ({ page }) => {
  await page.goto("/student/attempts/att_active/exam");
  await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Algebraic structure/i })).toBeVisible();
  await expect(page.getByRole("complementary", { name: /Response tools/i })).toBeVisible();
});

test("upload and finished states keep writing readonly", async ({ page }) => {
  await page.goto("/student/attempts/att_upload/upload");
  await expect(page.getByText("UPLOAD ONLY", { exact: true })).toBeVisible();
  await expect(page.getByText(/writing time has ended/i)).toBeVisible();

  await page.goto("/student/attempts/att_finished/finished");
  await expect(page.getByText("FINISHED REVIEW")).toBeVisible();
  await expect(page.getByText(/uploads and editing are disabled/i)).toBeVisible();
});

test("owner can reach creation and moderation report screens", async ({ page }) => {
  await page.goto("/owner/assessments/new");
  await expect(page.getByRole("heading", { name: /create assessment/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /create draft version/i })).toBeVisible();

  await page.goto("/owner/attempts/att_active/report");
  await expect(page.getByRole("heading", { name: /moderation report/i })).toBeVisible();
  await expect(page.getByText(/does not automatically accuse/i)).toBeVisible();
});
