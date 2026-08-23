import "./tracing"; // Must be first — initializes OpenTelemetry before any app code
import "./store/telemetry"; // Zustand subscribe + diff logging

import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import App from "./App";
import { TelemetryErrorBoundary } from "./components/TelemetryErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TelemetryErrorBoundary>
      <App />
    </TelemetryErrorBoundary>
  </React.StrictMode>,
);
