import { useEffect, useState, type FormEvent } from "react";

const fields = [
  ["baseline", "Baseline checkout", "before", true],
  ["candidate", "Candidate checkout", "after", true],
  ["alternative", "Alternative checkout", "Optional", false],
  ["target", "Python function", "invoice:total", true],
  ["contract", "Contract file", "invoice_contract.py", true],
  ["tests", "Shared unittest directory", "Optional", false],
] as const;

type Setting = (typeof fields)[number][0] | "cases";
type Settings = Partial<Record<Setting, string | number>>;

export default function LocalAuditForm({
  session,
  onReport,
}: {
  session: string;
  onReport: (report: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({});
  const [example, setExample] = useState<Settings | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/audit-settings", {
      headers: { "X-FrankenShell-Session": session },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not restore audit settings.");
        const data = await response.json();
        if (controller.signal.aborted) return;
        setSettings(data.saved ?? {});
        setExample(data.example);
        if (data.saved) setNotice("Last audit settings restored.");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice("Could not restore audit settings.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session]);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    const data = new FormData(event.currentTarget);
    const submitted = Object.fromEntries(
      fields.map(([key]) => [key, String(data.get(key) ?? "").trim()]),
    );
    setError("");
    setNotice("");
    setRunning(true);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FrankenShell-Session": session,
        },
        body: JSON.stringify({
          ...submitted,
          cases: Number(data.get("cases")),
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Could not run the local audit.");
      }
      onReport(await response.text());
      const saved = response.headers.get("X-FrankenShell-Settings-Saved");
      if (saved)
        setNotice(
          saved === "yes"
            ? "Audit settings saved on this computer."
            : "The audit ran, but settings could not be saved.",
        );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not run the local audit.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="audit-local" aria-labelledby="local-audit-title">
      <h2 id="local-audit-title">Run an audit</h2>
      <p>
        Enter absolute paths or paths relative to the project directory printed
        in your terminal. Select checkouts and a contract you trust.
      </p>
      {example && (
        <button
          className="audit-save"
          type="button"
          disabled={running}
          onClick={() => {
            setSettings(example);
            setError("");
            setNotice("");
          }}
        >
          Load invoice example
        </button>
      )}
      <form onSubmit={run}>
        <fieldset disabled={loading || running} aria-label="Audit settings">
          {fields.map(([name, label, placeholder, required]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                placeholder={placeholder}
                required={required}
                maxLength={4096}
                value={settings[name] ?? ""}
                onChange={(event) =>
                  setSettings({ ...settings, [name]: event.target.value })
                }
              />
            </label>
          ))}
          <label>
            Inputs to check
            <input
              name="cases"
              type="number"
              min={1}
              max={256}
              value={settings.cases ?? 8}
              onChange={(event) =>
                setSettings({ ...settings, cases: event.target.value })
              }
              required
            />
          </label>
          <div className="audit-run-action">
            <button className="benchmark-download" type="submit">
              {running ? "Running audit…" : "Run audit"}
            </button>
          </div>
        </fieldset>
        {running && (
          <p role="status">
            Checking each version locally. This can take up to two minutes.
          </p>
        )}
        {error && (
          <p role="alert" className="outcome-fail">
            {error}
          </p>
        )}
        {!running && notice && <p aria-live="polite">{notice}</p>}
      </form>
    </section>
  );
}
