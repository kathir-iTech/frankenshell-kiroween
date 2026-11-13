import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const query = new URLSearchParams(location.search);
const view = query.get("view");
const View =
  view === "lab"
    ? lazy(() => import("./App"))
    : view === "benchmarks" || query.has("case")
      ? lazy(() => import("./Benchmarks"))
      : lazy(() => import("./AuditWorkspace"));

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<main aria-busy="true">Loading FrankenShell…</main>}>
      <View />
    </Suspense>
  </React.StrictMode>,
);
