import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app";
import "./index.css";

async function enableMocking() {
  // MSW solo en tests (VITE_MSW=true). En dev se habla con el backend real.
  if (import.meta.env.VITE_MSW === "true") {
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
