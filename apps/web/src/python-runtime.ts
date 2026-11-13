import type { loadPyodide } from "pyodide";

export async function loadPython(baseUrl: string) {
  const url = new URL(baseUrl + "runtime/pyodide.mjs", self.location.origin);
  const runtime = (await import(/* @vite-ignore */ url.href)) as {
    loadPyodide: typeof loadPyodide;
  };
  return runtime.loadPyodide({ indexURL: new URL("./", url).href });
}
