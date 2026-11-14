import { useState, type FormEvent } from "react";

const fields = [
  ["baseline", "Baseline checkout", "before", true],
  ["candidate", "Candidate checkout", "after", true],
  ["alternative", "Alternative checkout", "Optional", false],
  ["target", "Python function", "invoice:total", true],
  ["contract", "Contract file", "invoice_contract.py", true],
  ["tests", "Shared unittest directory", "Optional", false],
] as const;

export default function LocalAuditForm({
  session,
  onReport,
}: {
  session: string;
  onReport: (report: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    const data = new FormData(event.currentTarget);
    const settings = Object.fromEntries(
      fields.map(([key]) => [key, String(data.get(key) ?? "").trim()]),
    );
    setError("");
    setRunning(true);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FrankenShell-Session": session,
        },
        body: JSON.stringify({ ...settings, cases: Number(data.get("cases")) }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Could not run the local audit.");
      }
      onReport(await response.text());
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
      <form onSubmit={run}>
        <fieldset disabled={running} aria-label="Audit settings">
          {fields.map(([name, label, placeholder, required]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                placeholder={placeholder}
                required={required}
                maxLength={4096}
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
              defaultValue={8}
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
      </form>
    </section>
  );
}
