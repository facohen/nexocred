import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app";
import "./index.css";

async function enableMocking() {
  // In dev the frontend runs entirely against MSW (no backend).
  if (import.meta.env.DEV) {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass" });
  }
}

void enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
