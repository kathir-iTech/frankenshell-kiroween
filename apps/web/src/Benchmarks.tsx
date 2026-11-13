import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import "./benchmarks.css";

const roles = ["before", "alternative", "reference"] as const;
const names = {
  before: "Previous release",
  alternative: "Controlled alternative",
  reference: "Official fix",
};
type Role = (typeof roles)[number];
type Outcome = { value: unknown } | { error: string; message: string };
type Probe = {
  args: unknown[];
  kwargs: Record<string, unknown>;
  expected: unknown;
  outcomes: Record<Role, Outcome>;
};
type Case = {
  id: string;
  title: string;
  target: string;
  requirement: string;
  description: string;
  releases: [string, string];
  test_release: string;
  test_class: string;
  upstream: { url: string; sha256: string }[];
  alternative_edit: { released: string; replacement: string };
  ordinary: Record<Role, { passed: number; total: number; methods: string[] }>;
  probes: Probe[];
  witness: Probe;
  regression: { source: string; verification: Record<Role, boolean> };
};

const repository = "https://github.com/kathir-iTech/frankenshell-kiroween";

function downloadTest(item: Case) {
  const url = URL.createObjectURL(
    new Blob([item.regression.source], { type: "text/x-python;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `test_${item.id}_regression.py`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderValue(value: unknown) {
  return JSON.stringify(value).replaceAll("\u00a0", "\\u00a0");
}

function renderCall(item: Case, probe: Probe) {
  const args = probe.args.map(renderValue);
  for (const [key, value] of Object.entries(probe.kwargs)) {
    args.push(`${key}=${renderValue(value)}`);
  }
  return `${item.target}(${args.join(", ")})`;
}

function renderOutcome(outcome: Outcome) {
  return "value" in outcome
    ? renderValue(outcome.value)
    : `${outcome.error}: ${outcome.message}`;
}

export default function Benchmarks() {
  const [cases, setCases] = useState<Case[]>([]);
  const [activeId, setActiveId] = useState("quantiles");
  const [probeIndex, setProbeIndex] = useState(-1);
  const [error, setError] = useState("");
  const item = cases.find((entry) => entry.id === activeId);
  const probe = item && (item.probes[probeIndex] ?? item.witness);

  useEffect(() => {
    const controller = new AbortController();
    fetch(import.meta.env.BASE_URL + "benchmarks.json", {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error("Could not load the benchmark report.");
        return response.json() as Promise<{
          schema_version: number;
          cases: Case[];
        }>;
      })
      .then((report) => {
        if (report.schema_version !== 1 || !report.cases.length) {
          throw new Error("The benchmark report could not be read.");
        }
        const requested = new URLSearchParams(location.search).get("case");
        if (requested && report.cases.some((entry) => entry.id === requested)) {
          setActiveId(requested);
        }
        setCases(report.cases);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not load the benchmark report.");
      });
    return () => controller.abort();
  }, []);

  function selectCase(id: string) {
    setActiveId(id);
    setProbeIndex(-1);
    const url = new URL(location.href);
    url.searchParams.set("case", id);
    history.replaceState(null, "", url);
  }

  return (
    <div className="benchmark-page">
      <header className="benchmark-header">
        <a className="wordmark" href={import.meta.env.BASE_URL}>
          FRANKEN<span>/</span>SHELL
        </a>
        <nav aria-label="Project">
          <a href="?view=lab">Interactive lab</a>
          <a href={repository}>
            Source <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main className="benchmark-main">
        {error && (
          <p role="alert">
            {error}{" "}
            <a href={repository}>View the source and reproduction steps</a>
          </p>
        )}
        {!item && !error && <p role="status">Loading benchmark results…</p>}
        {item && probe && (
          <>
            <nav className="benchmark-tabs" aria-label="CPython changes">
              {cases.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={entry.id === item.id}
                  onClick={() => selectCase(entry.id)}
                >
                  {entry.target}
                </button>
              ))}
            </nav>
            <section className="benchmark-intro">
              <div>
                <p className="benchmark-meta">
                  CPYTHON {item.releases[0]} → {item.releases[1]}
                </p>
                <h1>{item.title}</h1>
                <p>
                  A one-line alternative passed{" "}
                  {item.ordinary.alternative.passed} of{" "}
                  {item.ordinary.alternative.total} upstream tests in{" "}
                  {item.test_class}.
                </p>
              </div>
              <button
                className="benchmark-download"
                type="button"
                onClick={() => downloadTest(item)}
              >
                <ArrowDownToLine size={17} aria-hidden="true" /> Download
                regression test
              </button>
            </section>
            <section
              className="benchmark-experiment"
              aria-labelledby="benchmark-witness"
            >
              <header>
                <h2 id="benchmark-witness">Replay an input</h2>
                <span className="benchmark-meta">RECORDED PYTHON RUN</span>
              </header>
              <label className="benchmark-input">
                Input
                <select
                  value={probeIndex}
                  onChange={(event) =>
                    setProbeIndex(Number(event.target.value))
                  }
                >
                  <option value={-1}>Counterexample</option>
                  {item.probes.map((entry, index) => (
                    <option key={index} value={index}>
                      {renderCall(item, entry)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="benchmark-call">
                <code>{renderCall(item, probe)}</code>
                <span>
                  Expected <code>{renderValue(probe.expected)}</code>
                </span>
              </div>
              <div className="benchmark-table-wrap">
                <table className="benchmark-table">
                  <thead>
                    <tr>
                      <th scope="col">Implementation</th>
                      <th scope="col">Selected upstream tests</th>
                      <th scope="col">Result for this input</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((role) => {
                      const tests = item.ordinary[role];
                      const result = probe.outcomes[role];
                      const matches =
                        "value" in result &&
                        renderValue(result.value) ===
                          renderValue(probe.expected);
                      return (
                        <tr key={role}>
                          <th scope="row">
                            {names[role]}{" "}
                            <small>
                              {role === "before"
                                ? item.releases[0]
                                : role === "reference"
                                  ? item.releases[1]
                                  : "One-line edit"}
                            </small>
                          </th>
                          <td>
                            {tests.passed}/{tests.total} pass
                          </td>
                          <td>
                            <span
                              className={
                                matches ? "outcome-pass" : "outcome-fail"
                              }
                            >
                              {matches ? "Matches" : "Fails"}
                            </span>
                            <code>{renderOutcome(result)}</code>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="benchmark-details">
              <section>
                <h2>The regression test</h2>
                <p>
                  <code>{item.requirement}</code> · {item.description}
                </p>
                <pre>
                  <code>{item.regression.source}</code>
                </pre>
                <p>
                  The downloaded test was run against all three implementations.
                  It passed on the official fix and failed on the previous
                  release and the controlled alternative.
                </p>
              </section>
              <section>
                <h2>Reproduce the result</h2>
                <p>
                  From the repository root, run the benchmark with Python 3.14.
                </p>
                <pre>
                  <code>python scripts/reproduce_benchmarks.py --out out</code>
                </pre>
                <p>
                  The benchmark checks the SHA-256 of each downloaded source
                  file. The selected suite is the {item.test_class} class from
                  CPython {item.test_release}.
                </p>
                <details>
                  <summary>View test methods and source files</summary>
                  <ul>
                    {item.ordinary.reference.methods.map((name) => (
                      <li key={name}>
                        <code>{name}</code>
                      </li>
                    ))}
                  </ul>
                  <ul>
                    {item.upstream.map(({ url, sha256 }) => (
                      <li key={url}>
                        <a href={url}>{url.split("/").slice(-2).join("/")}</a>{" "}
                        <code title={sha256}>{sha256.slice(0, 12)}…</code>
                      </li>
                    ))}
                  </ul>
                </details>
                <details>
                  <summary>View the controlled edit</summary>
                  <pre>
                    <code>{`- ${item.alternative_edit.released}\n+ ${item.alternative_edit.replacement}`}</code>
                  </pre>
                </details>
                <p>
                  <a href={repository + "/blob/main/docs/audit-a-change.md"}>
                    Audit your own Python change
                  </a>
                </p>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
