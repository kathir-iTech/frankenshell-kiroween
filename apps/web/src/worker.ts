/// <reference lib="webworker" />
import { loadPython } from "./python-runtime";
const scope = self as unknown as DedicatedWorkerGlobalScope;
let runtime: Awaited<ReturnType<typeof loadPython>> | undefined;
let runner = "";
scope.onmessage = async ({ data }) => {
  const { runId, pack, input, variants } = data;
  const send = (type: string, payload: unknown) =>
    scope.postMessage({ runId, type, payload });
  try {
    if (!runtime) {
      send("loading", "Loading Python runtime");
      const [python, response] = await Promise.all([
        loadPython(data.baseUrl),
        fetch(data.baseUrl + "runner.py"),
      ]);
      if (!response.ok) throw new Error("Python runner could not be loaded");
      runtime = python;
      runner = await response.text();
    }
    send("started", "Executing reviewed source");
    runtime.globals.set("_pack_json", JSON.stringify(pack));
    runtime.globals.set("_input_json", JSON.stringify(input));
    runtime.globals.set("_variants_json", JSON.stringify(variants));
    const expression = data.search
      ? "find_counterexample(json.loads(_pack_json), json.loads(_input_json))"
      : "run_pack(json.loads(_pack_json), json.loads(_input_json), json.loads(_variants_json))";
    const result = runtime.runPython(
      runner + "\njson.dumps(" + expression + ", allow_nan=False)",
    );
    send("completed", JSON.parse(result));
  } catch (error) {
    send("error", error instanceof Error ? error.message : String(error));
  }
};
