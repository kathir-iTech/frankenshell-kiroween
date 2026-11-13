import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const View =
  new URLSearchParams(location.search).get("view") === "lab"
    ? lazy(() => import("./App"))
    : lazy(() => import("./Benchmarks"));

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<main aria-busy="true">Loading FrankenShell…</main>}>
      <View />
    </Suspense>
  </React.StrictMode>,
);
