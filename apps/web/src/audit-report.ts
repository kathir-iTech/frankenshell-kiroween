type Data = Record<string, unknown>;

export const maxReportBytes = 2 * 1024 * 1024;
const isObject = (value: unknown): value is Data =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function invalid(): never {
  throw new Error(
    "Choose a schema v2 JSON report from FrankenShell’s --config command.",
  );
}

export function parseAuditReport(text: string) {
  const data: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
  if (
    !isObject(data) ||
    data.schema_version !== 2 ||
    (data.status !== "passed" &&
      data.status !== "failed" &&
      data.status !== "inconclusive") ||
    !isCount(data.inputs_checked) ||
    (data.target !== undefined && typeof data.target !== "string") ||
    (data.error !== undefined && typeof data.error !== "string")
  )
    invalid();
  const inputsChecked = data.inputs_checked;
  const status: "passed" | "failed" | "inconclusive" = data.status;

  const revisions = data.revisions ?? {};
  if (
    !isObject(revisions) ||
    Object.keys(revisions).length > 5 ||
    (data.status !== "inconclusive" &&
      (!isObject(revisions.baseline) || !isObject(revisions.candidate)))
  ) {
    invalid();
  }
  const rows = Object.entries(revisions).map(([name, revision]) => {
    if (!isObject(revision) || !isObject(revision.counts)) invalid();
    const { failed, introduced, resolved } = revision.counts;
    if (
      !isCount(failed) ||
      !isCount(introduced) ||
      !isCount(resolved) ||
      failed > inputsChecked ||
      introduced > failed ||
      resolved > inputsChecked
    )
      invalid();
    const suite = revision.unittest;
    if (
      suite !== undefined &&
      (!isObject(suite) ||
        !isCount(suite.run) ||
        typeof suite.passed !== "boolean")
    )
      invalid();
    const tests = isObject(suite)
      ? `${suite.passed ? "Pass" : "Fail"} · ${suite.run} run`
      : "—";
    const git = isObject(revision.git) ? revision.git : null;
    const module = isObject(revision.module) ? revision.module : null;
    return {
      name,
      failed,
      introduced,
      resolved,
      tests,
      commit: typeof git?.commit === "string" ? git.commit : null,
      dirty: git?.dirty === true,
      modulePath: typeof module?.path === "string" ? module.path : null,
      moduleHash: typeof module?.sha256 === "string" ? module.sha256 : null,
    };
  });

  let witness = null;
  if (data.witness !== null) {
    const entry = data.witness;
    if (
      !isObject(entry) ||
      !Object.hasOwn(entry, "input") ||
      !isObject(entry.results) ||
      (entry.confirmation !== "pending" &&
        entry.confirmation !== "unconfirmed" &&
        entry.confirmation !== "inconsistent" &&
        entry.confirmation !== "reproduced") ||
      Object.keys(entry.results).length !== rows.length
    )
      invalid();
    const results = entry.results;
    witness = {
      input: entry.input,
      confirmation: entry.confirmation,
      results: rows.map(({ name }) => {
        const result = results[name];
        if (
          !Object.hasOwn(results, name) ||
          !isObject(result) ||
          !isObject(result.outcome) ||
          !isObject(result.violations)
        )
          invalid();
        return { name, outcome: result.outcome, violations: result.violations };
      }),
    };
  }
  return {
    status,
    target: data.target,
    error: data.error,
    inputsChecked,
    rows,
    witness,
  };
}
