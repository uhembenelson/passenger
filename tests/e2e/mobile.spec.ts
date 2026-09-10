import { expect, test } from "@playwright/test";

const mobileUrl = process.env.PASSENGER_MOBILE_URL;
test.skip(!mobileUrl, "Set PASSENGER_MOBILE_URL to a running Expo web export to test the mobile app.");

test("single mobile app switches modes and creates a declared parcel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(mobileUrl!);
  await expect(page.getByText(/INTERACTIVE DEMO/).first()).toBeVisible();
  await page.getByRole("tab", { name: /I'm travelling/ }).click();
  await expect(page.getByRole("button", { name: /Publish a trip/ }).first()).toBeVisible();
  await page.getByRole("tab", { name: /I'm sending/ }).click();
  await page.getByRole("button", { name: /Send a package/ }).first().click();
  await page.getByRole("textbox", { name: "Declared contents" }).fill("Sealed university documents for my sister");
  await page.getByRole("textbox", { name: "Weight (kg)", exact: true }).fill("1");
  await page.getByRole("textbox", { name: "Declared value (₦)" }).fill("20000");
  await page.getByRole("textbox", { name: "Full name" }).fill("Chidi Okafor");
  await page.getByRole("textbox", { name: "Phone number" }).fill("+2348030000107");
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(page.getByText("Sealed university documents for my sister", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close dialog" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("journey publication appears in traveller matches", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(mobileUrl!);
  await page.getByRole("tab", { name: /I'm travelling/ }).click();
  await page.getByRole("button", { name: /Publish a trip/ }).first().click();
  await page.getByRole("textbox", { name: "Total parcel capacity (kg)" }).fill("9");
  await page.getByRole("textbox", { name: "Maximum weight per parcel (kg)" }).fill("9");
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: /Publish my trip/ }).click();
  await expect(page.getByText("Your trip was published successfully.", { exact: false })).toBeVisible();
  await expect(page.getByText(/9 kg total capacity · up to 9 kg per parcel/)).toBeVisible();
});

test("separate sender and traveller personas complete both proof milestones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(mobileUrl!);
  const openParcel = async () => { await page.getByRole("tab", { name: /Deliveries/ }).click(); await page.getByRole("button", { name: /^View PSG-1047/ }).click(); };
  const persona = async (name: string, sending: boolean) => { await page.getByRole("tab", { name: /Profile/ }).click(); await page.getByRole("button", { name, exact: true }).click(); await page.getByRole("tab", { name: sending ? /I'm sending/ : /I'm travelling/ }).click(); };
  await openParcel();
  await page.getByRole("button", { name: "Generate handover code", exact: true }).click();
  const handover = await page.getByText(/^\d{8}$/).innerText();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await persona("Zainab", false);
  await openParcel();
  await expect(page.getByRole("button", { name: "Generate handover code", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Code from the sender" }).fill(handover);
  await page.getByRole("button", { name: "Confirm handover", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Code from the receiver" })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await persona("Amara", true);
  await openParcel();
  await page.getByRole("button", { name: "Generate delivery code", exact: true }).click();
  const delivery = await page.getByText(/^\d{8}$/).innerText();
  expect(delivery).not.toBe(handover);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await persona("Zainab", false);
  await openParcel();
  await page.getByRole("textbox", { name: "Code from the receiver" }).fill(delivery);
  await page.getByRole("button", { name: "Confirm delivery", exact: true }).click();
  await expect(page.getByText("The receiver's code confirmed delivery.", { exact: false })).toBeVisible();
});

test("route search provides recoverable empty results", async ({ page }) => {
  await page.goto(mobileUrl!);
  await page.getByRole("textbox", { name: "Search departure city" }).fill("Atlantis");
  await page.getByRole("button", { name: /Find routes.*→/ }).click();
  await expect(page.getByText("No journeys on this route. Yet.")).toBeVisible();
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page.getByText("No journeys on this route. Yet.")).toHaveCount(0);
});
