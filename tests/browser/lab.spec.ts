import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import JSZip from "jszip";

test("finds a silent regression from an input where the quick fix works", async ({
  page,
}) => {
  await page.goto("./?view=lab");
  await page.getByLabel("Row 2 quantity").fill("2");
  await page.getByRole("button", { name: "Find counterexample" }).click();
  await expect(page.getByRole("status")).toContainText(
    "1 of 3 starting rows needed",
    {
      timeout: 65000,
    },
  );
  await expect(
    page.getByRole("button", { name: "Inspect Quick fix" }),
  ).toContainText("Runs. But breaks the contract.");
  await expect(
    page.getByRole("button", { name: "Inspect Contract repair" }),
  ).toContainText("Behavior preserved");
});

test("real Python comparison, changed input, export reproduction, reset and cache", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./?view=lab");
  await expect(
    page.getByRole("heading", { name: "The Vanishing Order", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("lab-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Compare repairs", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Repair verified for this test set",
    { timeout: 60000 },
  );
  await expect(
    page.getByRole("button", { name: "Inspect Quick fix" }),
  ).toContainText("Runs. But breaks the contract.");
  await page.getByRole("button", { name: "Inspect Contract repair" }).click();
  await expect(page.locator(".check-status.failed")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evidence" }).click();
  const download = await downloadPromise;
  const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
  const folder = testInfo.outputPath("bundle");
  fs.mkdirSync(folder, { recursive: true });
  for (const [name, file] of Object.entries(zip.files)) {
    if (!file.dir)
      fs.writeFileSync(folder + "/" + name, await file.async("nodebuffer"));
  }
  const output = execFileSync("python", [folder + "/verify.py"], {
    encoding: "utf8",
  });
  expect(output).toContain("Reproduction passed");
  fs.appendFileSync(folder + "/original.py", "\n# altered");
  expect(() =>
    execFileSync("python", [folder + "/verify.py"], {
      encoding: "utf8",
      stdio: "pipe",
    }),
  ).toThrow();
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await page.getByLabel("Input JSON").fill(
    JSON.stringify([
      { id: "Z", quantity: "", unit_cents: 777 },
      { id: "N", quantity: "0", unit_cents: 999 },
    ]),
  );
  await page
    .getByRole("button", { name: "Compare repairs", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Repair verified for this test set",
    { timeout: 60000 },
  );
  await page.getByRole("button", { name: "Inspect Contract repair" }).click();
  await page.getByText("View raw output", { exact: true }).click();
  await expect(page.locator(".output-panel")).toContainText("777");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    page.getByText("Run the case to see which repair survives."),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Case selection" })
    .getByRole("button", { name: /Haunted cache/ })
    .click();
  await page
    .getByRole("button", { name: "Compare repairs", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Repair verified for this test set",
    { timeout: 60000 },
  );
  await expect(page.locator(".check-list")).toContainText(
    "Identical requests reuse a result",
  );
  await page.screenshot({
    path: testInfo.outputPath("lab-results.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("runtime load failure is visible and retryable", async ({ page }) => {
  await page.route("**/runtime/pyodide.mjs", (route) => route.abort());
  await page.goto("./?view=lab");
  await page
    .getByRole("button", { name: "Compare repairs", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByRole("button", { name: "Compare repairs", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Export evidence" }),
  ).toBeDisabled();
});

test("invalid input, cancellation, source diff, and mobile layout", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?view=lab");
  await expect(
    page.getByRole("button", { name: "Compare repairs", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await page.getByLabel("Input JSON").fill("{");
  await page
    .getByRole("button", { name: "Compare repairs", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Input error");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page
    .getByRole("button", { name: "Compare repairs", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel run", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cancelled");
  await page.getByRole("tab", { name: "Source & diff" }).click();
  await expect(page.locator(".line-added")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("lab-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("table input edits the underlying JSON and switching cases restores clean data", async ({
  page,
}) => {
  await page.goto("./?view=lab");
  await page.getByLabel("Row 2 unit_cents").fill("850");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await expect(page.getByLabel("Input JSON")).toHaveValue(/850/);
  await page
    .getByRole("navigation", { name: "Case selection" })
    .getByRole("button", { name: /Haunted cache/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "The Haunted Cache", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Row 1 key")).toHaveValue("mist");
});
