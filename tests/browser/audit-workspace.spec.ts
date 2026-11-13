import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

function createAudit() {
  const root = mkdtempSync(join(tmpdir(), "frankenshell-browser-"));
  const paths: string[] = [];
  const folders: string[] = [];
  function write(path: string, content: string) {
    const file = join(root, path);
    writeFileSync(file, content);
    paths.push(file);
    return file;
  }
  try {
  const source = {
    baseline: "def total(value): return value\n",
    candidate: "def total(value): return value or 10\n",
  };
  for (const [role, content] of Object.entries(source)) {
    const folder = join(root, role);
    mkdirSync(folder);
    folders.push(folder);
    write(join(role, "invoice.py"), content);
  }
  write(
    "contract.py",
    "def generate(rng, index): return 0\n" +
      "def check(value, output): return {} if value == output else {'preserve_zero': {'expected': value, 'actual': output}}\n",
  );
  const config = write(
    "config.json",
    JSON.stringify({
      schema_version: 1,
      target: "invoice:total",
      display_target: "Invoice total",
      rule_descriptions: { preserve_zero: "An explicit zero must stay zero." },
      contract: "contract.py",
      checkouts: { baseline: "baseline", candidate: "candidate" },
      cases: 1,
      timeout: 15,
    }),
  );
  const audit = spawnSync(
    "python",
    ["scripts/audit_repair.py", "--config", config],
    { encoding: "utf8", timeout: 30_000 },
  );
  expect(audit.status, audit.stderr || audit.stdout).toBe(1);
  return audit.stdout;
  } finally {
    for (const file of paths) unlinkSync(file);
    for (const folder of folders) rmdirSync(folder);
    rmdirSync(root);
  }
}

test("opens a real checkout report and keeps the comparison after an invalid import", async ({ page }) => {
  const report = createAudit();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Review a Python patch" }),
  ).toBeVisible();
  const input = page.getByLabel("Choose audit JSON");
  await input.setInputFiles({
    name: "invoice-audit.json",
    mimeType: "application/json",
    buffer: Buffer.from("\uFEFF" + report),
  });
  await expect(page.getByRole("status")).toContainText("Candidate failed");
  await expect(
    page.getByRole("heading", { name: "Invoice total" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Counterexample" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "preserve_zero" }),
  ).toBeVisible();
  await expect(page.getByText("Expected", { exact: true })).toBeVisible();
  await expect(
    page.getByText("An explicit zero must stay zero."),
  ).toBeVisible();
  await expect(page.getByText("Actual", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByRole("alert")).toContainText("valid JSON");
  await expect(page.getByRole("status")).toContainText("Candidate failed");
  await page.getByRole("link", { name: "CPython cases", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A fix that only works for quartiles" }),
  ).toBeVisible();
});
