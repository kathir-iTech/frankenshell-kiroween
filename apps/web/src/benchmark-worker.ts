/// <reference lib="webworker" />
import { loadPython } from "./python-runtime";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const cases = new Set(["quantiles", "dedent"]);

scope.onmessage = async ({ data }) => {
  const { baseUrl, caseId, args, kwargs } = data;
  if (!cases.has(caseId)) {
    scope.postMessage({ error: "Unknown CPython case" });
    return;
  }
  try {
    const packUrl = new URL(
      baseUrl + "benchmark-sources/" + caseId + ".json",
      scope.location.origin,
    );
    const [python, pack] = await Promise.all([
      loadPython(baseUrl),
      fetch(packUrl).then(async (response) => {
        if (!response.ok) throw new Error("CPython source could not be loaded");
        return response.text();
      }),
    ]);
    scope.postMessage({ phase: "executing" });
    python.globals.set("_pack", pack);
    python.globals.set("_input", JSON.stringify({ args, kwargs }));
    const results = python.runPython(`
import json

def run_benchmark(pack, inputs):
    results = {}
    for name, source in pack["sources"].items():
        scope = {"__name__": "reviewed_" + name}
        exec(compile(source, "<" + name + ">", "exec"), scope)
        function = scope[pack["function"]]
        try:
            results[name] = {"value": function(*inputs["args"], **inputs["kwargs"])}
        except Exception as exc:
            results[name] = {"error": type(exc).__name__, "message": str(exc)}
    return results

json.dumps(run_benchmark(json.loads(_pack), json.loads(_input)), allow_nan=False)
`);
    scope.postMessage({ outcomes: JSON.parse(results) });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
