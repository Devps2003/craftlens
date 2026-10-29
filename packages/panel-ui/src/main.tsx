import { createRoot } from "react-dom/client";
import { hostToPanelSchema, panelViewSchema, type PanelToHost, type PanelView } from "@craftlens/contracts";
import { App } from "./App";
import "./styles.css";

declare function acquireVsCodeApi(): {
  postMessage(message: PanelToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing root");
const root = createRoot(rootElement);

function render(view: PanelView): void {
  root.render(<App view={view} onMessage={(message) => vscode.postMessage(message)} />);
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const parsed = hostToPanelSchema.safeParse(event.data);
  if (!parsed.success || parsed.data.type !== "state") return;
  const view = panelViewSchema.safeParse(parsed.data.state);
  if (!view.success) return;
  vscode.setState(view.data);
  render(view.data);
});

const cached = panelViewSchema.safeParse(vscode.getState());
if (cached.success) render(cached.data);
vscode.postMessage({ schemaVersion: 1, type: "ready" });
