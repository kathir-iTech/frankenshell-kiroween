import { useRef, useState } from "react";
import { ArrowUpRight, FileJson } from "lucide-react";
import { maxReportBytes, parseAuditReport } from "./audit-report";
import LocalAuditForm from "./LocalAuditForm";
import "./benchmarks.css";
import "./audit-workspace.css";

const guide =
  "https://github.com/kathir-iTech/frankenshell-kiroween/blob/main/docs/audit-a-change.md";
const command =
  "python scripts/audit_repair.py --config audit-config.json > audit.json";
const localCommand = "python scripts/serve_workspace.py";
const statuses = {
  passed: "Candidate passed",
  failed: "Candidate failed",
  inconclusive: "Audit inconclusive",
};
type Report = ReturnType<typeof parseAuditReport>;
const session =
  location.hostname === "127.0.0.1"
    ? new URLSearchParams(location.hash.slice(1)).get("session")
    : null;

function valueText(value: unknown) {
  const compact = JSON.stringify(value);
  return compact.length <= 100 ? compact : JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export default function AuditWorkspace() {
  const [opened, setOpened] = useState<{
    name: string;
    report: Report;
    raw: string;
  } | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  const report = opened?.report;
  const missed =
    report?.rows.filter((row) => row.testsPassed && row.failed > 0) ?? [];

  async function openReport(file: File) {
    const id = ++request.current;
    setError("");
    try {
      if (file.size > maxReportBytes)
        throw new Error("Choose a report under 2 MiB.");
      const raw = await file.text();
      const report = parseAuditReport(raw);
      if (id === request.current) setOpened({ name: file.name, report, raw });
    } catch (error) {
      if (id === request.current) {
        setError(
          error instanceof SyntaxError
            ? "This file does not contain valid JSON."
            : error instanceof Error
              ? error.message
              : "Could not read this file.",
        );
      }
    }
  }

  return (
    <>
      <header className="benchmark-header">
        <a className="wordmark" href={import.meta.env.BASE_URL}>
          FRANKEN<span>/</span>SHELL
        </a>
        <nav aria-label="Project">
          <a href="?view=benchmarks">CPython cases</a>
          <a href="?view=lab">Interactive lab</a>
          <a href={guide}>
            CLI guide <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main className="benchmark-main audit-main">
        <div className="benchmark-intro">
          <h1>Review a Python patch</h1>
          <p>
            Open a FrankenShell audit to see which behavior changed, which
            inputs failed, and what each version returned.
          </p>
        </div>
        {session && (
          <LocalAuditForm
            session={session}
            onReport={(raw) => {
              const report = parseAuditReport(raw);
              ++request.current;
              setError("");
              setOpened({ name: "audit.json", report, raw });
            }}
          />
        )}
        <section className="audit-import" aria-labelledby="audit-import-title">
          <div>
            <h2 id="audit-import-title">Open an audit report</h2>
            <p>The JSON file stays in this browser.</p>
          </div>
          <label className="benchmark-download audit-file">
            <FileJson size={16} aria-hidden="true" />
            Choose audit JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void openReport(file);
              }}
            />
          </label>
          {error && (
            <p className="audit-import-error outcome-fail" role="alert">
              {error}
            </p>
          )}
        </section>
        {report && (
          <section className="audit-results" aria-labelledby="audit-title">
            <header>
              <div>
                <h2 id="audit-title">
                  {report.displayTarget ?? "Checkout audit"}
                </h2>
                <p className="benchmark-meta">{opened.name}</p>
              </div>
              <p role="status">
                <strong>{statuses[report.status]}</strong> ·{" "}
                {report.inputsChecked} inputs checked
              </p>
              <button
                className="audit-save"
                type="button"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([opened.raw], { type: "application/json" }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = opened.name;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Save report
              </button>
            </header>
            {report.error && <p className="benchmark-error">{report.error}</p>}
            {missed.length > 0 && (
              <div
                className="audit-findings"
                aria-label="Failures missed by shared tests"
              >
                {missed.map((row) => (
                  <p key={row.name}>
                    <strong>{row.name}</strong> passed the shared tests and
                    failed the contract on{" "}
                    <strong>
                      {row.failed} of {report.inputsChecked}
                    </strong>{" "}
                    checked inputs.
                  </p>
                ))}
              </div>
            )}
            {report.rows.length > 0 && (
              <div className="benchmark-table-wrap">
                <table className="benchmark-table">
                  <thead>
                    <tr>
                      <th scope="col">Version</th>
                      <th scope="col">Shared tests</th>
                      <th scope="col">Failing inputs</th>
                      <th scope="col">New failures vs. baseline</th>
                      <th scope="col">Baseline failures resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.name}>
                        <th scope="row">{row.name}</th>
                        <td>{row.tests}</td>
                        <td>{row.failed}</td>
                        <td>{row.introduced}</td>
                        <td>{row.resolved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="audit-count-note">
                  Counts are per input. The same input can resolve one baseline
                  violation and introduce another.
                </p>
              </div>
            )}
            {report.witness ? (
              <div className="audit-witness">
                <h3>Counterexample</h3>
                <p>Replay status · {report.witness.confirmation}</p>
                <div className="audit-input">
                  <strong>Input</strong>
                  <pre>{valueText(report.witness.input)}</pre>
                </div>
                <div className="audit-outcomes">
                  {report.witness.results.map(
                    ({ name, outcome, violations }) => (
                      <section key={name}>
                        <h4>{name}</h4>
                        <p
                          className={
                            Object.keys(violations).length
                              ? "outcome-fail"
                              : "outcome-pass"
                          }
                        >
                          {Object.keys(violations).length
                            ? "Contract failed"
                            : "Contract passed"}
                        </p>
                        {isRecord(outcome.error) ? (
                          <p>
                            <strong>Raised</strong>{" "}
                            <code>
                              {typeof outcome.error.type === "string"
                                ? outcome.error.type
                                : "Error"}
                            </code>
                            {typeof outcome.error.message === "string" && (
                              <> · {outcome.error.message}</>
                            )}
                          </p>
                        ) : (
                          <pre aria-label={`Output for ${name}`}>
                            {valueText(outcome.output ?? null)}
                          </pre>
                        )}
                        {Object.entries(violations).map(([rule, detail]) => (
                          <div className="audit-violation" key={rule}>
                            <h5>
                              {rule === "exception"
                                ? "Execution raised an exception"
                                : rule}
                            </h5>
                            {report.ruleDescriptions.has(rule) && (
                              <p>{report.ruleDescriptions.get(rule)}</p>
                            )}
                            {isRecord(detail) &&
                            Object.hasOwn(detail, "expected") &&
                            Object.hasOwn(detail, "actual") ? (
                              <dl className="audit-values">
                                <dt>Expected</dt>
                                <dd>
                                  <code>{valueText(detail.expected)}</code>
                                </dd>
                                <dt>Actual</dt>
                                <dd>
                                  <code>{valueText(detail.actual)}</code>
                                </dd>
                              </dl>
                            ) : rule !== "exception" ||
                              !isRecord(outcome.error) ? (
                              <pre>{valueText(detail)}</pre>
                            ) : null}
                          </div>
                        ))}
                      </section>
                    ),
                  )}
                </div>
                <details className="audit-raw">
                  <summary>Raw counterexample data</summary>
                  <pre>{JSON.stringify(report.witness, null, 2)}</pre>
                </details>
              </div>
            ) : (
              <p className="audit-witness">
                This report contains no counterexample.
              </p>
            )}
            {(report.displayTarget !== report.target ||
              report.rows.some((row) => row.commit || row.modulePath)) && (
              <details className="audit-witness">
                <summary>Source and Git revisions</summary>
                {report.displayTarget !== report.target && (
                  <p>
                    CLI target <code>{report.target}</code>
                  </p>
                )}
                {report.rows.map((row) => (
                  <p key={row.name}>
                    <strong>{row.name}</strong>
                    {row.commit && (
                      <>
                        <br />
                        Commit <code>{row.commit}</code>
                        {row.dirty && " · Working tree had changes"}
                      </>
                    )}
                    {row.modulePath && (
                      <>
                        <br />
                        Module <code>{row.modulePath}</code>
                      </>
                    )}
                    {row.moduleHash && (
                      <>
                        <br />
                        SHA-256 <code>{row.moduleHash}</code>
                      </>
                    )}
                  </p>
                ))}
              </details>
            )}
          </section>
        )}
        <section className="audit-start">
          <h2>{session ? "Run from the terminal" : "Run on your own code"}</h2>
          <p>
            {session
              ? "Use the CLI for a saved config and repeatable runs in CI."
              : "From a FrankenShell checkout, build the workspace and launch it locally. Then enter your checkout paths and run the audit from the browser."}
          </p>
          <pre>
            <code>
              {session ? command : `npm ci\nnpm run build\n${localCommand}`}
            </code>
          </pre>
          <p>
            <a href={guide}>Set up the checkout verifier</a> ·{" "}
            <a href="?view=benchmarks">Explore the CPython cases</a>
          </p>
        </section>
      </main>
    </>
  );
}
