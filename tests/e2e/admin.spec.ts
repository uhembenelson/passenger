import { expect, test } from "@playwright/test";

test("overview renders, filters deliveries, and opens accessible details", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good things are moving." })).toBeVisible();
  await expect(page.getByText("Demo workspace", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search deliveries" }).fill("PSG-1048");
  await page.getByRole("button", { name: "PSG-1048 Amara Okafor" }).click();
  await expect(page.getByRole("dialog", { name: "Parcel details" })).toBeVisible();
  await expect(page.getByText("University admission documents", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search deliveries" }).fill("no-such-parcel");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("parcel approval updates the queue and audit trail", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Needs review", exact: false }).click();
  await page.getByRole("button", { name: "PSG-1049 Amara Okafor" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Review note", { exact: false }).fill("Declared cotton clothing inspected for this demo review.");
  await dialog.getByRole("button", { name: "Approve parcel", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("review completed successfully");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "PSG-1049 Amara Okafor" })).toHaveCount(0);
  await page.getByRole("button", { name: "Activity log", exact: true }).click();
  await expect(page.getByText("Parcel reviewed", { exact: true })).toBeVisible();
  await expect(page.getByText(/Declared cotton clothing inspected/)).toBeVisible();
});

test("member review changes verification without a page reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Verifications/ }).click();
  await page.getByRole("button", { name: /Tobi Adeyemi/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Review note", { exact: false }).fill("Identity evidence reviewed through the external demo process.");
  await dialog.getByRole("button", { name: "Mark member verified" }).click();
  await expect(page.getByRole("button", { name: /Tobi Adeyemi/ })).toContainText("verified");
});

test("external payout requires reference, note, and confirmation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  await expect(page.getByText("A ledger, not a payment processor.")).toBeVisible();
  await page.getByRole("button", { name: "Record external payout", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("does not send money");
  await dialog.getByLabel("External transaction reference", { exact: false }).fill("DEMO-BANK-001");
  await dialog.getByLabel("Reconciliation note", { exact: false }).fill("Demo external payment checked against provider record.");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Record external payout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No money was moved");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("dispute reconciliation closes the case without fabricating delivery proof", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Disputes/ }).click();
  await page.getByRole("button", { name: /PSG-1044/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("External transaction reference", { exact: false }).fill("DEMO-REFUND-001");
  await dialog.getByLabel("Reconciliation note", { exact: false }).fill("Both accounts reviewed; external refund checked in this demo.");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Record external refund & resolve", exact: true }).click();
  await expect(page.getByRole("button", { name: /PSG-1044/ })).toContainText("resolved");
  await page.getByRole("button", { name: "Deliveries", exact: true }).click();
  await page.getByRole("textbox", { name: "Search deliveries" }).fill("PSG-1044");
  await expect(page.locator("tbody tr")).toContainText("Disputed");
});

test("mobile width navigation and overview have no page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good things are moving." })).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: /^Verifications/ }).click();
  await expect(page.getByRole("heading", { name: "Verifications", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
