import React from "react";
import ReactDOM from "react-dom/client";
import "@hypercore/ui/styles/globals.css";
import "./App.css";
import App from "./App";
import { Titlebar } from "./components/titlebar";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Titlebar />
      <div className="min-h-0 flex-1 overflow-hidden">
        <App />
      </div>
    </div>
  </React.StrictMode>,
);
