import { existsSync, mkdirSync, readFileSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import { createGitCliRunner } from "@craftlens/context";
import { DEFAULT_SETTINGS, userSettingsSchema, type UserSettings } from "@craftlens/contracts";
import { defaultLogDir, hookCommand, installManagedHooks, uninstallManagedHooks } from "@craftlens/hook-bridge";
import { discoverFreeLlmApi } from "@craftlens/providers";
import { hashRoots } from "@craftlens/security";
import { CraftLensController } from "./controller";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const roots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  const workspaceId = hashRoots(roots.length > 0 ? roots : ["no-folder"]);
  const controller = new CraftLensController({
    workspaceId,
    roots,
    dataRoot: context.globalStorageUri.fsPath,
    git: createGitCliRunner(),
    captureFile: path.join(homedir(), ".craftlens", "capture.json"),
    discover: () => discoverFreeLlmApi(),
  });
  const stored = userSettingsSchema.safeParse(context.globalState.get("craftlens.settings"));
  const inspected = vscode.workspace.getConfiguration("craftlens").inspect<string>("privacyMode");
  const userSettings: UserSettings = stored.success ? stored.data : { ...DEFAULT_SETTINGS };
  if (typeof inspected?.globalValue === "string") {
    const privacy = userSettingsSchema.shape.privacyMode.safeParse(inspected.globalValue);
    if (privacy.success) userSettings.privacyMode = privacy.data;
  }
  const workspacePrivacy = userSettingsSchema.shape.privacyMode.safeParse(inspected?.workspaceValue);
  controller.updateSettings(userSettings, workspacePrivacy.success ? { privacyMode: workspacePrivacy.data } : undefined);
  controller.setApiKey((await context.secrets.get("craftlens.apiKey")) ?? "");
  await controller.restore();
  await controller.prepare();
  await installHooksIfNeeded(context, controller);

  const provider = new CraftLensViewProvider(context, controller);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("craftlens.panel", provider),
    vscode.commands.registerCommand("craftlens.focusPanel", () => {
      void vscode.commands.executeCommand("craftlens.panel.focus");
    }),
    vscode.commands.registerCommand("craftlens.explainSelection", () => explain(controller, "tradeoff")),
    vscode.commands.registerCommand("craftlens.verifySelection", () => explain(controller, "verify")),
    vscode.commands.registerCommand("craftlens.reanalyze", () => void controller.handle({ schemaVersion: 1, type: "reanalyze" })),
    vscode.commands.registerCommand("craftlens.toggleQuiet", async () => {
      await controller.handle({ schemaVersion: 1, type: "toggle-quiet" });
      await persist(context, controller);
    }),
    vscode.commands.registerCommand("craftlens.loadSynthetic", () => void controller.loadSynthetic()),
    vscode.commands.registerCommand("craftlens.clearLocalData", () => void controller.handle({ schemaVersion: 1, type: "clear-data" })),
    vscode.commands.registerCommand("craftlens.installHooks", () => install(context)),
    vscode.commands.registerCommand("craftlens.uninstallHooks", () => uninstall()),
    vscode.commands.registerCommand("craftlens.setApiKey", () => setKey(context, controller)),
  );
  controller.onChange(() => {
    void persist(context, controller);
  });
  watchInbox(workspaceId, controller);
}

async function installHooksIfNeeded(context: vscode.ExtensionContext, controller: CraftLensController): Promise<void> {
  if (await hooksLookInstalled(context)) {
    controller.setHooksInstalled(true);
    return;
  }
  const result = await installManagedHooks(hookPaths(context));
  controller.setHooksInstalled(result.ok);
}

async function explain(controller: CraftLensController, mode: "tradeoff" | "verify"): Promise<void> {
  const text = vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor.selection) ?? "";
  await controller.explainSelection(text, mode);
  await vscode.commands.executeCommand("craftlens.panel.focus");
}

async function persist(context: vscode.ExtensionContext, controller: CraftLensController): Promise<void> {
  await context.globalState.update("craftlens.settings", controller.getSettings());
}

async function setKey(context: vscode.ExtensionContext, controller: CraftLensController): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: "CraftLens provider API key",
    password: true,
    prompt: "Stored in VS Code secret storage. It is not written to the panel or task history.",
    ignoreFocusOut: true,
  });
  if (!key) return;
  await context.secrets.store("craftlens.apiKey", key);
  const baseUrl = await vscode.window.showInputBox({
    title: "OpenAI-compatible base URL",
    prompt: "Example: https://api.openai.com/v1. Leave empty to stay offline.",
    value: controller.getSettings().providerBaseUrl,
  });
  if (baseUrl) {
    controller.updateSettings({ ...controller.getSettings(), providerBaseUrl: baseUrl, providerModel: controller.getSettings().providerModel || "gpt-4.1-mini" });
  }
  controller.setApiKey(key);
}

function hookPaths(context: vscode.ExtensionContext): { hooksFile: string; backupFile: string; command: string } {
  return {
    hooksFile: path.join(homedir(), ".cursor", "hooks.json"),
    backupFile: path.join(homedir(), ".craftlens", "hooks-backup.json"),
    command: hookCommand(process.execPath, path.join(context.extensionPath, "dist", "hook-cli.js")),
  };
}

async function install(context: vscode.ExtensionContext): Promise<void> {
  const result = await installManagedHooks(hookPaths(context));
  if (!result.ok) {
    void vscode.window.showErrorMessage(`CraftLens did not change hooks.json. ${result.reason}`);
    return;
  }
  void vscode.window.showInformationMessage("CraftLens hooks installed for this user. Existing hook commands were kept.");
}

async function uninstall(): Promise<void> {
  const extensionPath = vscode.extensions.getExtension("craftlens.craftlens")?.extensionPath ?? path.join(homedir(), ".craftlens");
  const result = await uninstallManagedHooks({
    hooksFile: path.join(homedir(), ".cursor", "hooks.json"),
    backupFile: path.join(homedir(), ".craftlens", "hooks-backup.json"),
    command: hookCommand(process.execPath, path.join(extensionPath, "dist", "hook-cli.js")),
  });
  if (!result.ok) void vscode.window.showErrorMessage(result.reason);
  else void vscode.window.showInformationMessage("CraftLens hooks removed. The previous hooks.json was restored.");
}

async function hooksLookInstalled(context: vscode.ExtensionContext): Promise<boolean> {
  try {
    const text = await readFile(hookPaths(context).hooksFile, "utf8");
    return text.includes("hook-cli.js");
  } catch {
    return false;
  }
}

function watchInbox(workspaceId: string, controller: CraftLensController): void {
  const dir = defaultLogDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${workspaceId}.jsonl`);
  let offset = 0;
  const consume = (analyzeLast: boolean) => {
    if (!existsSync(file)) return;
    const text = readFileSync(file, "utf8");
    const slice = text.slice(offset);
    offset = text.length;
    const lines = slice.split("\n").filter((line) => line.trim().length > 0);
    lines.forEach((line, index) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        void controller.ingest(parsed, analyzeLast && index === lines.length - 1);
      } catch {
        // A partial line is read again after the next write advances the offset only when complete.
      }
    });
  };
  consume(true);
  try {
    const watcher = watch(dir, () => consume(true));
    watcher.on("error", () => undefined);
  } catch {
    // Live events stay disconnected. The panel still works for manual and synthetic tasks.
  }
}

class CraftLensViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly controller: CraftLensController,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webview.html = html(webview, this.context);
    const post = () => {
      void webview.postMessage({ schemaVersion: 1, type: "state", state: this.controller.view() });
    };
    this.controller.onChange(post);
    webview.onDidReceiveMessage(async (message: unknown) => {
      const result = await this.controller.handle(message);
      if (result.openPath) {
        const document = await vscode.workspace.openTextDocument(result.openPath);
        await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true });
      }
      if (result.clipboard) await vscode.env.clipboard.writeText(result.clipboard);
      if (result.exportText) {
        const target = await vscode.window.showSaveDialog({ filters: { JSON: ["json"] }, saveLabel: "Export CraftLens history" });
        if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(result.exportText));
      }
      post();
    });
    post();
  }
}

function html(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const nonce = String(Math.random()).slice(2);
  const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "panel.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "panel.css"));
  const csp = webview.cspSource;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
<link rel="stylesheet" nonce="${nonce}" href="${style}" />
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
