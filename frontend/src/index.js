import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
