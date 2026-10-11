const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.locator('.auth-form input[type="email"]').fill("superadmin@passenger.app");
  await page.locator('.auth-form input[type="password"]').fill("PassengerAdmin123");
  await page.locator(".auth-form .auth-submit").click();
  await page.waitForTimeout(7000);

  // Sidebar -> Notifications
  await page.locator('.sidebar-figma-item', { hasText: "Notifications" }).first().click();
  await page.waitForTimeout(1500);
  // Top tab -> Emails (inside notifications)
  await page.getByRole("tab", { name: "Emails", exact: true }).first().click();
  await page.waitForTimeout(1200);
  // Sub tab -> Templates
  await page.getByRole("tablist", { name: "Email tools" }).getByRole("tab", { name: "Templates" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "New template" }).click();
  await page.waitForTimeout(1200);

  // Builder open. Inspect the Default subject field.
  const settingsPanel = page.getByRole("heading", { name: "Email settings" }).first();
  console.log("email-settings-visible:", await settingsPanel.isVisible().catch(() => false));
  const subjectField = page.locator('input[placeholder="Subject new emails start with"]');
  console.log("subject-field-count:", await subjectField.count());
  console.log("subject-field-disabled:", await subjectField.isDisabled().catch(() => "n/a"));

  // Try to save without a subject -> expected error
  await page.getByRole("button", { name: "Save template" }).click();
  await page.waitForTimeout(1200);
  const banner = await page.locator(".figma-notifications-banner.error").first().innerText().catch(() => "(none)");
  console.log("error-banner:", JSON.stringify(banner));
  const activeEl = await page.evaluate(() => document.activeElement && document.activeElement.outerHTML.slice(0, 120));
  console.log("active-element-after-error:", JSON.stringify(activeEl));

  // Now type the name AND a default subject, save
  await page.locator('input[placeholder="Template name"]').fill("Weekly digest");
  await subjectField.fill("What is happening this week");
  await page.getByRole("button", { name: "Save template" }).click();
  await page.waitForTimeout(1500);
  const success = await page.locator(".figma-notifications-banner.success").first().innerText().catch(() => "(none)");
  console.log("success-banner:", JSON.stringify(success));

  // Template listed? find row and delete it for cleanup
  const row = page.locator("tr", { hasText: "Weekly digest" });
  console.log("row-visible:", await row.count());
  if (await row.count()) {
    try {
      await row.locator('button[title="Delete template"]').click();
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Delete template" }).last().click();
      await page.waitForTimeout(1200);
    } catch (e) {
      console.log("cleanup-failed:", e.message.split("\n")[0]);
    }
    console.log("remaining-after-cleanup:", await page.locator("tr", { hasText: "Weekly digest" }).count());
  }
  await browser.close();
})();