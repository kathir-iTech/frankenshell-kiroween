import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

test("opens the benchmark, changes input, and downloads the verified regression", async ({
  page,
}, testInfo) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "A fix that only works for quartiles" }),
  ).toBeVisible();
  const alternative = page
    .getByRole("row")
    .filter({ hasText: "Controlled alternative" });
  await expect(alternative).toContainText("5/5 pass");
  await expect(alternative).toContainText("Fails");
  await expect(alternative).toContainText("[7,7,7]");
  await page
    .getByRole("combobox", { name: "Input", exact: true })
    .selectOption("0");
  await expect(alternative).toContainText("Matches");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download regression test" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("test_quantiles_regression.py");
  expect(readFileSync((await download.path())!, "utf8")).toBe(
    readFileSync("evidence/test_quantiles_regression.py", "utf8"),
  );
  await page.getByRole("button", { name: "textwrap.dedent" }).click();
  await expect(alternative).toContainText("6/6 pass");
  await expect(alternative).toContainText("Fails");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A blank line that stops dedenting" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("benchmark-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: testInfo.outputPath("benchmark-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Interactive lab" }).click();
  await expect(
    page.getByRole("heading", { name: "The Vanishing Order" }),
  ).toBeVisible();
});

test("runs the pinned implementations in Python and resets live status on input change", async ({
  page,
}) => {
  await page.route("**/benchmarks.json", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.cases[0].witness.outcomes.alternative.value = [99];
    await route.fulfill({ response, json: body });
  });
  await page.goto("./");
  const alternative = page
    .getByRole("row")
    .filter({ hasText: "Controlled alternative" });
  const official = page.getByRole("row").filter({ hasText: "Official fix" });
  await expect(alternative).toContainText("[99]");
  await page.getByRole("button", { name: "Run in Python" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "EXECUTED IN THIS BROWSER",
    { timeout: 75_000 },
  );
  await expect(alternative).toContainText("[7,7,7]");
  await expect(official).toContainText("[7]");
  await page
    .getByRole("combobox", { name: "Input", exact: true })
    .selectOption("0");
  await expect(page.getByRole("status")).toHaveText("RECORDED RESULTS");
  await expect(alternative).toContainText("Matches");
  await page.getByRole("button", { name: "textwrap.dedent" }).click();
  await page.getByRole("button", { name: "Run in Python" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "EXECUTED IN THIS BROWSER",
    { timeout: 75_000 },
  );
  await expect(alternative).toContainText("Fails");
  await expect(official).toContainText("Matches");
});

test("preserves recorded evidence when live source fails to load", async ({
  page,
}) => {
  await page.route("**/benchmark-sources/quantiles.json", (route) =>
    route.abort(),
  );
  await page.goto("./");
  await page.getByRole("button", { name: "Run in Python" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Live replay could not finish",
  );
  await expect(page.getByRole("status")).toHaveText("RECORDED RESULTS");
  await expect(
    page.getByRole("button", { name: "Run in Python" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Download regression test" }),
  ).toBeEnabled();
  await page.unroute("**/benchmark-sources/quantiles.json");
  await page.getByRole("button", { name: "Run in Python" }).click();
  await expect(page.getByRole("status")).toHaveText("EXECUTED IN THIS BROWSER", {
    timeout: 75_000,
  });
});
