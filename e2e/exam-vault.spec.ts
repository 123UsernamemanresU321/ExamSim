import { expect, test } from "@playwright/test";

test("public landing explains browser mode and private release", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /secure, institutional-grade timed exam simulation/i })).toBeVisible();
  await expect(page.getByText(/tamper-evident, not tamper-proof/i)).toBeVisible();
  await expect(page.getByText(/private buckets/i).first()).toBeVisible();
});

test("student waiting screen shows metadata only", async ({ page }) => {
  await page.goto("/student/attempts/att_waiting/waiting");
  await expect(page.getByRole("heading", { name: /waiting room/i })).toBeVisible();
  await expect(page.getByText(/paper is locked until start time/i)).toBeVisible();
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

test("student recovery status can report issues and links to scoped finalization", async ({ page }) => {
  await page.goto("/student/attempts/att_upload/recovery-status");
  await expect(page.getByRole("heading", { name: /attempt recovery status/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /report a technical issue/i })).toBeVisible();
  await expect(page.getByLabel(/issue type/i)).toBeVisible();
  await expect(page.getByLabel(/what happened/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /submit issue report/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /open finalization/i })).toHaveAttribute("href", "/student/attempts/att_upload/finalize");
});

test("owner can reach creation and moderation report screens", async ({ page }) => {
  await page.goto("/owner/assessments/new");
  await expect(page.getByRole("heading", { name: /create assessment/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /create draft version/i })).toBeVisible();

  await page.goto("/owner/attempts/att_active/report");
  await expect(page.getByRole("heading", { name: /moderation report/i })).toBeVisible();
  await expect(page.getByText(/does not automatically accuse/i)).toBeVisible();
});

test("owner security readiness panels do not overflow at laptop or mobile widths", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1224, height: 768 });
  await page.goto("/owner/security");

  const providerPanel = page.getByRole("region", { name: "V3 provider and import readiness dashboard" });
  const deploymentPanel = page.getByRole("region", { name: "V3 deployment readiness console" });
  const productionPanel = page.getByRole("region", {
    name: "Production readiness matrix for Smart Import / Exam Compiler and Guest SEB / Lockdown",
  });
  const productionControls = page.getByRole("list", { name: "Production security controls" });
  const narrativePanels = [providerPanel, deploymentPanel, productionPanel, productionControls];

  await page.getByRole("heading", { name: "Provider and import readiness" }).scrollIntoViewIfNeeded();
  await expect(providerPanel).toBeVisible();
  await expect(page.getByRole("list", { name: "Provider capability readiness" })).toBeVisible();
  await expect(page.getByText(/application error|unhandled runtime error/i)).toHaveCount(0);

  for (const panel of narrativePanels) {
    const laptopOverflow = await panel.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(laptopOverflow).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: "/tmp/examsim-security-readiness-laptop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "Provider and import readiness" }).scrollIntoViewIfNeeded();
  for (const panel of narrativePanels) {
    const mobileOverflow = await panel.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(mobileOverflow).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: "/tmp/examsim-security-readiness-mobile.png" });
  expect(consoleErrors).toEqual([]);
});
