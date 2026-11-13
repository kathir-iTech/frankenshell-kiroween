import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronRight,
  Code2,
  FileCode2,
  History,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
  Terminal,
  X,
  XCircle,
} from "lucide-react";
import { diffLines } from "diff";
import JSZip from "jszip";
import type { CasePack, Report, Result, Variant } from "./types";
const labels: Record<Variant, string> = {
  original: "Original",
  shortcut: "Quick fix",
  corrected: "Contract repair",
};
const pretty = (value: unknown) =>
  JSON.stringify(value, null, 2) ?? "No output";
async function sha(content: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DataTable({
  input,
  onChange,
}: {
  input: string;
  onChange: (value: string) => void;
}) {
  let rows: Record<string, unknown>[];
  try {
    const value = JSON.parse(input);
    if (
      !Array.isArray(value) ||
      value.some((r) => typeof r !== "object" || r === null)
    )
      return (
        <p className="data-message">
          Switch to JSON to provide a list of records.
        </p>
      );
    rows = value;
  } catch {
    return (
      <p className="data-message">
        The JSON needs a correction. Open the JSON editor.
      </p>
    );
  }
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  if (!keys.length)
    return <p className="data-message">Add a record in the JSON editor.</p>;
  return (
    <div className="data-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th className="row-index">#</th>
            {keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="row-index">{String(i + 1).padStart(2, "0")}</td>
              {keys.map((k) => (
                <td key={k}>
                  <input
                    aria-label={`Row ${i + 1} ${k}`}
                    value={String(row[k] ?? "")}
                    placeholder="empty"
                    onChange={(e) => {
                      const copy = structuredClone(rows);
                      copy[i][k] =
                        typeof row[k] === "number" && e.target.value !== ""
                          ? Number(e.target.value)
                          : e.target.value;
                      onChange(pretty(copy));
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default function App() {
  const [cases, setCases] = useState<CasePack[]>([]),
    [caseId, setCaseId] = useState("vanishing-order"),
    [input, setInput] = useState(""),
    [report, setReport] = useState<Report | null>(null),
    [phase, setPhase] = useState("Ready to investigate"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [variant, setVariant] = useState<Variant>("shortcut"),
    [tab, setTab] = useState<"evidence" | "source" | "contract">("source"),
    [history, setHistory] = useState<
      { caseId: string; report: Report; time: string }[]
    >([]),
    [exporting, setExporting] = useState(false);
  const [editingInput, setEditingInput] = useState(false);
  const worker = useRef<Worker | null>(null),
    active = useRef(""),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    editor = useRef<HTMLTextAreaElement>(null);
  const pack = cases.find((c) => c.id === caseId),
    result = report?.results[variant];
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "cases.json")
      .then((r) => {
        if (!r.ok) throw Error("Case files could not be loaded");
        return r.json();
      })
      .then((data: CasePack[]) => {
        setCases(data);
        setInput(pretty(data.find((c) => c.id === "vanishing-order")!.input));
      })
      .catch((e) => setError(String(e)));
    return () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  function stop(message = "Cancelled. Ready for a fresh run.") {
    active.current = "";
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
    setPhase(message);
  }
  function choose(id: string) {
    stop("Ready to investigate");
    setCaseId(id);
    setInput(pretty(cases.find((c) => c.id === id)!.input));
    setReport(null);
    setError("");
    setVariant("shortcut");
    setTab("source");
  }
  function run(compare: boolean, search = false) {
    if (!pack || busy) return;
    let data: unknown;
    try {
      data = JSON.parse(input);
      if (new TextEncoder().encode(input).length > 65536)
        throw Error("Input must be under 64 KiB");
    } catch (e) {
      setError("Input error: " + String(e));
      editor.current?.focus();
      return;
    }
    setError("");
    setBusy(true);
    setReport(null);
    setPhase("Loading Python runtime…");
    const runId = crypto.randomUUID();
    active.current = runId;
    const currentPack = pack;
    // A new worker gives every run a fresh Python interpreter and no inherited cache.
    worker.current?.terminate();
    const w = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    const fail = (message: string) => {
      if (active.current !== runId) return;
      stop("Run could not complete");
      setError(message);
    };
    const startDeadline = (ms: number, message: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fail(message), ms);
    };
    startDeadline(
      60000,
      "Runtime loading exceeded 60 seconds. Check your connection and try again.",
    );
    w.onerror = (e) => fail(e.message || "Python worker failed");
    w.onmessage = ({ data: event }) => {
      if (event.runId !== active.current) return;
      if (event.type === "loading") setPhase("Loading Python runtime…");
      if (event.type === "started") {
        setPhase("Running the source and behavioral checks…");
        startDeadline(
          currentPack.limits.executionMs,
          "Execution timed out. The worker was stopped. Reset or run again.",
        );
      }
      if (event.type === "error") fail(String(event.payload));
      if (event.type === "completed") {
        const next = event.payload as Report;
        if (timer.current) clearTimeout(timer.current);
        active.current = "";
        w.terminate();
        worker.current = null;
        setBusy(false);
        setReport(next);
        if (next.search) setInput(pretty(next.input));
        setVariant(compare ? "shortcut" : "original");
        setTab("evidence");
        setPhase(
          next.search
            ? `Counterexample found: ${next.search.witnessRows} of ${next.search.startingRows} starting rows needed (${next.search.inputsChecked} inputs checked)`
            : next.verifiedCandidates.length
              ? "Repair verified for this test set"
              : next.failureReproduced
                ? "Failure reproduced"
                : "Failure not reproduced with this input",
        );
        setHistory((previous) =>
          [
            {
              caseId: currentPack.id,
              report: next,
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
            ...previous,
          ].slice(0, 8),
        );
      }
    };
    w.postMessage({
      runId,
      pack,
      input: data,
      search,
      variants: compare ? ["original", "shortcut", "corrected"] : ["original"],
      baseUrl: new URL(import.meta.env.BASE_URL, location.href).pathname,
    });
  }
  async function exportEvidence() {
    if (!pack || !report) return;
    setExporting(true);
    try {
      const files: Record<string, string> = {
        "case.json": pretty(pack),
        "input.json": pretty(report.input),
        "report.json": pretty(report),
        "contract.md": pack.contract,
      };
      for (const v of ["original", "shortcut", "corrected"] as Variant[])
        files[v + ".py"] = pack.sources[v] + "\n";
      const runner = await fetch(import.meta.env.BASE_URL + "runner.py");
      if (!runner.ok) throw Error("Verifier could not be loaded");
      files["runner.py"] = await runner.text();
      files["verify.py"] =
        `import hashlib, json\nfrom pathlib import Path\nfrom runner import run_pack\nroot=Path(__file__).resolve().parent\nb=json.loads((root/'evidence.json').read_text(encoding='utf-8'))\nfor a in b['artifacts']:\n    content=(root/a['name']).read_bytes()\n    assert hashlib.sha256(content).hexdigest()==a['sha256'], 'Hash mismatch: '+a['name']\na={x['name']:x['content'] for x in b['artifacts']}\npack=json.loads(a['case.json'])\nprevious=json.loads(a['report.json'])\nreport=run_pack(pack,json.loads(a['input.json']),list(previous['results']))\nfor v in report['results']:\n    for key in ['output','error','checks','passed']:\n        assert report['results'][v][key]==previous['results'][v][key], 'Reproduction mismatch: '+v+'/'+key\nprint('Artifact hashes match supplied manifest. Reproduction passed.')\nprint('Verification covers the supplied input and contract, not universal correctness.')\n`;
      files["README.txt"] =
        "FrankenShell evidence bundle\nReview the included Python before executing it. This is trusted-code execution, not a sandbox.\nRun: python verify.py\nHashes detect differences against this supplied manifest; they do not authenticate its author.\nPrepared candidate source was executed in your browser. No live AI generation is claimed.\n";
      const artifacts = await Promise.all(
        Object.entries(files).map(async ([name, content]) => ({
          name,
          content,
          sha256: await sha(content),
        })),
      );
      const bundle = {
        schemaVersion: 1,
        caseId: pack.id,
        runtime: "Pyodide 314.0.7",
        createdAt: new Date().toISOString(),
        executionOrigin: "executed_now",
        candidateOrigin: "prepared",
        artifacts,
      };
      const zip = new JSZip();
      for (const [name, content] of Object.entries(files))
        zip.file(name, content);
      zip.file("evidence.json", pretty(bundle));
      download(
        await zip.generateAsync({ type: "blob" }),
        `frankenshell-${pack.id}.zip`,
      );
    } catch (e) {
      setError("Export failed: " + String(e));
    } finally {
      setExporting(false);
    }
  }

  const invalidateInput = (value: string) => {
    setInput(value);
    setReport(null);
    setPhase("Input changed. Run again to collect evidence.");
  };
  const totalChecks = result?.checks.length ?? 0;
  const passedChecks =
    result?.checks.filter((c) => c.status === "passed").length ?? 0;
  return (
    <div className="workbench">
      <header className="app-header">
        <a className="wordmark" href="#main">
          FRANKEN<span>/</span>SHELL<span className="wordmark-dot">+</span>
        </a>
        <div className="header-caption">
          REPAIR VERIFICATION
          <br />
          <span>KIROWEEN / 2026</span>
        </div>
        <div className="header-right">
          <a href={import.meta.env.BASE_URL}>CPython evidence</a>
          <span className="local-indicator" />
          <span>LOCAL EXECUTION</span>
          <div className="header-rule" />
          <span className="version">v0.1</span>
        </div>
      </header>

      <div className="app-body">
        <aside className="project-rail">
          <div className="rail-heading">
            CASE FILES <span>{String(cases.length).padStart(2, "0")}</span>
          </div>
          <nav aria-label="Case selection">
            {cases.map((c, i) => (
              <button
                key={c.id}
                className={"file-link " + (caseId === c.id ? "active" : "")}
                onClick={() => {
                  choose(c.id);
                  setEditingInput(false);
                }}
              >
                <span className="file-no">0{i + 1}</span>
                <span className="file-name">
                  {c.id === "vanishing-order"
                    ? "Vanishing order"
                    : "Haunted cache"}
                  <small>
                    {c.id === "vanishing-order"
                      ? "Record preservation"
                      : "Cache invalidation"}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
          <div className="rail-divider" />
          <div className="rail-description">
            <span className="rail-label">WHAT YOU’RE TESTING</span>
            <p>Removing an error is only half the job.</p>
            <p className="rail-secondary">
              Check what a repair changes—and what it accidentally leaves
              behind.
            </p>
          </div>
          <div className="rail-history">
            <div className="rail-heading">
              RUN HISTORY <History size={13} />
            </div>
            {history.length ? (
              history.slice(0, 5).map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    stop();
                    setCaseId(h.caseId);
                    setInput(pretty(h.report.input));
                    setReport({ ...h.report, executionOrigin: "recorded_run" });
                    setPhase("Recorded run — rerun to verify now");
                    setVariant(
                      h.report.results.shortcut ? "shortcut" : "original",
                    );
                    setTab("evidence");
                  }}
                >
                  <span
                    className={
                      "history-mark " +
                      (h.report.verifiedCandidates.length ? "passed" : "failed")
                    }
                  />
                  <span>
                    Run {String(history.length - i).padStart(2, "0")}
                    <small>
                      {h.caseId === "vanishing-order" ? "Order" : "Cache"}
                    </small>
                  </span>
                  <time>{h.time}</time>
                </button>
              ))
            ) : (
              <p className="history-empty">No runs yet.</p>
            )}
          </div>
          <div className="rail-bottom">
            <span className="rail-symbol">F/S</span>
            <span>
              Built independently.
              <br />
              Executed on your device.
            </span>
          </div>
        </aside>

        <main id="main">
          <div className="breadcrumb">
            <span>WORKSPACE</span>
            <span>/</span>
            <span>CASE {caseId === "vanishing-order" ? "001" : "002"}</span>
            <span className="case-kind">{pack?.tag}</span>
          </div>
          <section className="case-heading">
            <div>
              <h1>{pack?.title ?? "Opening workspace…"}</h1>
              <p>{pack?.description}</p>
            </div>
            <div className="run-actions">
              {busy ? (
                <button className="cancel-button" onClick={() => stop()}>
                  <Square size={13} /> Cancel run
                </button>
              ) : (
                <button
                  className="reset-button"
                  onClick={() => {
                    stop("Ready to investigate");
                    setReport(null);
                    setError("");
                    if (pack) setInput(pretty(pack.input));
                  }}
                  aria-label="Reset"
                >
                  <RotateCcw size={15} />
                </button>
              )}
              <button
                className="search-button"
                disabled={busy || !pack}
                onClick={() => run(true, true)}
              >
                Find counterexample
              </button>
              <button
                className="run-button"
                aria-label="Compare repairs"
                disabled={busy || !pack}
                onClick={() => run(true)}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}
                {busy ? "Running…" : "Compare repairs"}
                <span>↗</span>
              </button>
            </div>
          </section>

          <div className="run-line" role="status" aria-live="polite">
            <span
              className={
                "status-dot " +
                (busy
                  ? "running"
                  : report?.verifiedCandidates.length
                    ? "passed"
                    : "")
              }
            />
            <span>{phase}</span>
            <span className="run-label">
              {report?.executionOrigin === "recorded_run"
                ? "RECORDED"
                : busy
                  ? "EXECUTING"
                  : report
                    ? "EXECUTED NOW"
                    : "NOT RUN"}
            </span>
          </div>
          {error && (
            <div className="error" role="alert">
              <XCircle size={16} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}

          <div className="lab-layout">
            <section className="input-workspace">
              <div className="panel-heading">
                <div>
                  <span className="panel-index">01</span> INPUT
                </div>
                <span className="filename">
                  {caseId === "vanishing-order"
                    ? "orders.json"
                    : "requests.json"}
                </span>
              </div>
              <div className="input-intro">
                <h2>Start with the data.</h2>
                <p>
                  {caseId === "vanishing-order"
                    ? "One blank quantity. Three orders to preserve."
                    : "One key. Two configurations. Three requests."}
                </p>
              </div>
              <div className="input-format">
                <div role="group" aria-label="Input format">
                  <button
                    className={!editingInput ? "selected" : ""}
                    onClick={() => setEditingInput(false)}
                  >
                    Table
                  </button>
                  <button
                    className={editingInput ? "selected" : ""}
                    onClick={() => setEditingInput(true)}
                  >
                    JSON
                  </button>
                </div>
                <button
                  className="restore-button"
                  disabled={busy}
                  onClick={() => {
                    if (pack) invalidateInput(pretty(pack.input));
                  }}
                >
                  Restore sample
                </button>
              </div>
              <fieldset disabled={busy} className="input-fieldset">
                {editingInput ? (
                  <>
                    <label className="sr-only" htmlFor="input">
                      Input JSON
                    </label>
                    <textarea
                      id="input"
                      ref={editor}
                      spellCheck={false}
                      value={input}
                      onChange={(e) => invalidateInput(e.target.value)}
                    />
                  </>
                ) : (
                  <DataTable input={input} onChange={invalidateInput} />
                )}
              </fieldset>
              <div className="input-hint">
                Edit a value to challenge the repair.
              </div>
              <div className="contract-summary">
                <span className="rail-label">THE PROMISE</span>
                <p>{pack?.contract}</p>
                <button onClick={() => setTab("contract")}>
                  Read verification rules <ArrowUpRight size={13} />
                </button>
              </div>
              <button
                className="original-button"
                onClick={() => run(false)}
                disabled={busy || !pack}
              >
                <Terminal size={15} />
                <span>Run the original only</span>
                <ArrowUpRight size={14} />
              </button>
            </section>

            <section className="inspector">
              <div className="panel-heading">
                <div>
                  <span className="panel-index">02</span> INSPECT
                </div>
                <button
                  className="export-button"
                  aria-label="Export evidence"
                  disabled={!report || exporting}
                  onClick={exportEvidence}
                >
                  <ArrowDownToLine size={14} />
                  {exporting ? "Exporting…" : "Export run"}
                </button>
              </div>
              <div className="tabs" role="tablist" aria-label="Inspector">
                {(["source", "evidence", "contract"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                  >
                    {t === "source"
                      ? "Source & diff"
                      : t === "evidence"
                        ? "Test results"
                        : "Contract"}
                    {t === "evidence" && report && (
                      <span className="tab-count">
                        {report.results.corrected?.checks.length ?? "–"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {tab !== "contract" && (
                <div className="variant-switch" aria-label="Inspected version">
                  {(["original", "shortcut", "corrected"] as Variant[]).map(
                    (v) => (
                      <button
                        key={v}
                        className={variant === v ? "selected" : ""}
                        onClick={() => setVariant(v)}
                      >
                        {labels[v]}
                      </button>
                    ),
                  )}
                  <span>.py</span>
                </div>
              )}

              {tab === "source" ? (
                <div className="code-editor">
                  <div className="editor-caption">
                    <span>
                      {variant === "original"
                        ? "original.py"
                        : `original.py → ${variant}.py`}
                    </span>
                    <span>
                      {variant === "original" ? "READ ONLY" : "DIFF VIEW"}
                    </span>
                  </div>
                  <pre className="source-lines">
                    {pack &&
                      (variant === "original"
                        ? pack.sources.original.split("\n").map((line, i) => (
                            <div className="code-line" key={i}>
                              <span className="line-no">{i + 1}</span>
                              <code>{line || " "}</code>
                            </div>
                          ))
                        : diffLines(
                            pack.sources.original,
                            pack.sources[variant],
                          ).map((part, i) => (
                            <div
                              className={
                                part.added
                                  ? "line-added"
                                  : part.removed
                                    ? "line-removed"
                                    : "line-same"
                              }
                              key={i}
                            >
                              {part.value
                                .split("\n")
                                .filter(
                                  (line, j, arr) => j < arr.length - 1 || line,
                                )
                                .map((line, j) => (
                                  <div className="code-line" key={j}>
                                    <span className="line-no">
                                      {part.added
                                        ? "+"
                                        : part.removed
                                          ? "−"
                                          : "·"}
                                    </span>
                                    <code>{line || " "}</code>
                                  </div>
                                ))}
                            </div>
                          )))}
                  </pre>
                  <div className="editor-bottom">
                    <span>PYTHON</span>
                    <span>
                      {variant === "corrected" && caseId === "vanishing-order"
                        ? "Kiro-assisted repair"
                        : "Prepared source"}{" "}
                      · runs locally
                    </span>
                  </div>
                </div>
              ) : tab === "evidence" ? (
                result ? (
                  <div className="evidence-content">
                    <div className="check-overview">
                      <span>
                        {String(passedChecks).padStart(2, "0")}
                        <small>/{String(totalChecks).padStart(2, "0")}</small>
                      </span>
                      <div>
                        <strong>
                          {result.passed
                            ? "Behavior checks passed"
                            : "Behavior check failed"}
                        </strong>
                        <p>
                          {result.error
                            ? result.error.type
                            : result.passed
                              ? "All required assertions passed for this input."
                              : "Open a failed assertion to inspect the difference."}
                        </p>
                      </div>
                    </div>
                    <div className="check-list">
                      {result.checks.map((c) => (
                        <details key={c.id} open={c.status === "failed"}>
                          <summary>
                            <span
                              className={
                                c.status === "passed"
                                  ? "check-pass"
                                  : "check-fail"
                              }
                            >
                              {c.status === "passed" ? (
                                <Check size={13} />
                              ) : (
                                <X size={13} />
                              )}
                            </span>
                            <span>{c.label}</span>
                            <span className={"check-status " + c.status}>
                              {c.status === "passed" ? "PASS" : "FAIL"}
                            </span>
                          </summary>
                          <div className="comparison">
                            <div>
                              <small>EXPECTED</small>
                              <pre>{pretty(c.expected)}</pre>
                            </div>
                            <div>
                              <small>ACTUAL</small>
                              <pre>{pretty(c.actual)}</pre>
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                    <details className="output-panel">
                      <summary>
                        {result.error
                          ? "View Python traceback"
                          : "View raw output"}
                        <Code2 size={14} />
                      </summary>
                      <pre>{result.traceback ?? pretty(result.output)}</pre>
                      {result.stdout && <pre>{result.stdout}</pre>}
                    </details>
                  </div>
                ) : (
                  <div className="empty-state">
                    <span className="empty-index">—</span>
                    <h2>No test results yet.</h2>
                    <p>Run the case to see which repair survives.</p>
                    <button onClick={() => run(true)} disabled={busy || !pack}>
                      Start comparison <ArrowUpRight size={14} />
                    </button>
                  </div>
                )
              ) : (
                <div className="contract-view">
                  <div className="contract-label">
                    BEHAVIORAL CONTRACT / 001
                  </div>
                  <h2>What must stay true.</h2>
                  <p>{pack?.contract}</p>
                  <div className="contract-note">
                    <Check size={15} />
                    <span>
                      Assertions are authored independently of the repair.
                      Passing them supports this input and contract, not every
                      possible input.
                    </span>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="outcomes">
            <div className="outcomes-heading">
              <span className="panel-index">03</span>
              <h2>Execution summary</h2>
              <span>
                {report
                  ? "SELECT A VERSION TO INSPECT"
                  : "AWAITING YOUR FIRST RUN"}
              </span>
            </div>
            <div className="outcome-list">
              {(["original", "shortcut", "corrected"] as Variant[]).map(
                (v, i) => {
                  const r = report?.results[v];
                  const verified = report?.verifiedCandidates.includes(v);
                  const fails =
                    r?.checks.filter((c) => c.status === "failed").length ?? 0;
                  return (
                    <button
                      key={v}
                      aria-label={"Inspect " + labels[v]}
                      className={
                        "outcome-row " +
                        (variant === v ? "selected " : "") +
                        (r
                          ? verified
                            ? "verified"
                            : fails
                              ? "failed"
                              : "neutral"
                          : "")
                      }
                      onClick={() => {
                        setVariant(v);
                        setTab("evidence");
                      }}
                    >
                      <span className="outcome-index">0{i + 1}</span>
                      <strong>{labels[v]}</strong>
                      <span className="outcome-description">
                        {!r
                          ? v === "original"
                            ? "Reproduce the failure"
                            : v === "shortcut"
                              ? "Suppress the error"
                              : "Preserve the behavior"
                          : r.error
                            ? r.error.type
                            : verified
                              ? "Behavior preserved"
                              : fails
                                ? "Runs. But breaks the contract."
                                : "Checks pass; failure not reproduced."}
                      </span>
                      <span className="outcome-status">
                        {r ? (
                          <>
                            {verified ? (
                              <Check size={13} />
                            ) : fails ? (
                              <X size={13} />
                            ) : null}
                            {r.checks.length - fails}/{r.checks.length}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  );
                },
              )}
            </div>
          </section>
          <footer>
            <span>Prepared repairs. Real execution.</span>
            <span>
              Python / WebAssembly <span className="footer-separator">·</span>{" "}
              No data leaves your device
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
