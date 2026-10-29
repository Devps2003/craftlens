import { useState } from "react";
import type { OnboardingAnswers, PanelToHost, PanelView, RiskCard } from "@craftlens/contracts";

const PHASE_LABEL: Record<PanelView["phase"], string> = {
  empty: "Empty",
  preparing: "Preparing",
  working: "Agent working",
  review: "Review ready",
  waiting: "Waiting for engineer",
  paused: "Paused",
  error: "Error",
  offline: "Offline",
  disconnected: "Live events disconnected",
};

export function App({ view, onMessage }: { view: PanelView; onMessage: (message: PanelToHost) => void }) {
  if (!view.onboarded) return <Onboarding onMessage={onMessage} />;
  return (
    <main>
      <a className="skip" href="#next-action">Skip to next action</a>
      <header>
        <div className="row">
          <strong>CraftLens</strong>
          <span className="status" role="status">{PHASE_LABEL[view.phase]}</span>
          <span className="muted">{view.profileId}</span>
        </div>
        <div className="row">
          <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "toggle-compact" })}>Toggle compact mode</button>
          <button type="button" aria-pressed={view.quiet} onClick={() => onMessage({ schemaVersion: 1, type: "toggle-quiet" })}>Toggle quiet mode</button>
          <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "pin" })}>Pin task</button>
          <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "reanalyze" })}>Re-analyze task</button>
        </div>
      </header>
      <p className="banner" role="note">{view.connectionDetail}</p>
      {view.offline ? (
        <p className="banner">Free offline checklist. Start FreeLLMAPI on this computer and CraftLens uses it automatically. No CraftLens account.</p>
      ) : (
        <p className="banner">Free models via FreeLLMAPI on this computer. Only a short prompt summary is sent there.</p>
      )}
      <p className="muted">CraftLens is free. Task history stays on this laptop.</p>
      {view.notice ? <p role="alert">{view.notice}</p> : null}
      {!view.task ? <Empty view={view} onMessage={onMessage} /> : <TaskView view={view} onMessage={onMessage} />}
      <History view={view} onMessage={onMessage} />
    </main>
  );
}

function Empty({ view, onMessage }: { view: PanelView; onMessage: (message: PanelToHost) => void }) {
  return (
    <section>
      <h2>No task yet</h2>
      <p>CraftLens has not seen a prompt for this workspace.</p>
      <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "load-synthetic" })}>Load synthetic task</button>
      {view.phase === "disconnected" ? <p>Live events disconnected. You can still review a diff with Re-analyze after a task exists.</p> : null}
    </section>
  );
}

function TaskView({ view, onMessage }: { view: PanelView; onMessage: (message: PanelToHost) => void }) {
  const task = view.task;
  if (!task) return null;
  const risk = task.risks[0];
  const action = task.actions[0];
  if (view.compact) {
    return (
      <section aria-label="Compact focus card">
        <h2>{task.promptSummary || "Untitled task"}</h2>
        {risk ? <RiskCardView risk={risk} detail={view.detail} onMessage={onMessage} taskId={task.id} /> : <p>No open high-value risk.</p>}
        <div id="next-action">{action ? <ActionView view={view} onMessage={onMessage} /> : null}</div>
      </section>
    );
  }
  return (
    <div>
      <section aria-label="Task overview">
        <h2>{task.promptSummary || "Untitled task"}</h2>
        <p>Category: {task.category}. State: {task.status}. Analysis: {task.analysisStatus}.</p>
        <p className="muted">{task.analysisMeta.provider === "offline" ? "Deterministic offline brief." : `Provider: ${task.analysisMeta.provider}.`} Requests this task: {task.analysisMeta.requestCount}.</p>
        {task.analysisMeta.limitation ? <p>{task.analysisMeta.limitation}</p> : null}
      </section>
      {view.quiet ? null : (
        <section aria-label="Engineering decisions">
          <h2>Decisions</h2>
          {task.decisions.map((card) => (
            <article className="card" key={card.id}>
              <h3>{card.title}</h3>
              <p>{clip(card.rationale, view.detail)}</p>
              {view.level === "beginner" ? <p className="muted">Status {card.status} means this is {card.status === "likely" ? "a likely reading, not a verified fact" : card.status}.</p> : null}
              <p className="muted">Provenance: {card.provenance}</p>
            </article>
          ))}
        </section>
      )}
      <section aria-label="Risks and edge cases">
        <h2>Risks</h2>
        {task.risks.length === 0 ? <p>No open risks matched this change.</p> : task.risks.map((item) => (
          <RiskCardView key={item.id} risk={item} detail={view.detail} onMessage={onMessage} taskId={task.id} />
        ))}
      </section>
      <div id="next-action">
        <ActionView view={view} onMessage={onMessage} />
      </div>
      <section aria-label="Validation">
        <h2>Validation</h2>
        <p>Git: {task.validation.git.state}. {task.validation.git.summary}</p>
        {task.validation.git.limitation ? <p>{task.validation.git.limitation}</p> : null}
        <p>Diagnostics: {task.validation.diagnostics.state === "observed" ? `${task.validation.diagnostics.errorCount ?? 0} errors, ${task.validation.diagnostics.warningCount ?? 0} warnings` : "Not observed"}</p>
        <ul>
          {task.changedFiles.map((file) => (
            <li key={file.relativePath}>
              <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "open-file", path: file.relativePath })}>
                Open {file.relativePath}
              </button>
              <span> {file.attribution}{file.binary ? ", binary" : ""}{file.renamed ? ", renamed" : ""}{file.protected ? ", protected" : ""}</span>
            </li>
          ))}
        </ul>
        <ul>
          {task.validation.tests.length === 0 ? <li>Tests: Not observed</li> : task.validation.tests.map((row) => (
            <li key={row.id}>{row.commandSummary}: {row.status === "passed" ? "Passed (observed)" : row.status === "failed" ? "Failed (observed)" : "Not observed"}</li>
          ))}
        </ul>
        <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "copy-checklist" })}>Copy checklist</button>
      </section>
    </div>
  );
}

function RiskCardView({ risk, detail, onMessage, taskId }: { risk: RiskCard; detail: PanelView["detail"]; onMessage: (message: PanelToHost) => void; taskId: string }) {
  return (
    <article className="card">
      <h3>{risk.title}</h3>
      <p>{risk.severity} · {risk.confidence} · {risk.domain}</p>
      <p>Failure mode: {clip(risk.failureMode, detail)}</p>
      <p>Verify: {risk.verification}</p>
      <p className="muted">Provenance: {risk.provenance}</p>
      <div className="row">
        <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "feedback", taskId, cardId: risk.id, useful: true })}>Useful</button>
        <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "feedback", taskId, cardId: risk.id, useful: false })}>Not useful</button>
      </div>
    </article>
  );
}

function ActionView({ view, onMessage }: { view: PanelView; onMessage: (message: PanelToHost) => void }) {
  const task = view.task;
  const action = task?.actions[0];
  if (!task || !action) return <section aria-label="Next action"><h2>Next action</h2><p>No action yet.</p></section>;
  return (
    <section aria-label="Next action">
      <h2>Next action</h2>
      <article className="card">
        <h3>{action.verb}</h3>
        <p>{clip(action.rationale, view.detail)}</p>
        <p className="muted">Why this: {action.why} Effort: {action.effort}.</p>
        <div className="row">
          <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "action", taskId: task.id, cardId: action.id, status: "done" })}>Mark complete</button>
          <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "action", taskId: task.id, cardId: action.id, status: "not-applicable" })}>Not applicable</button>
          <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "action", taskId: task.id, cardId: action.id, status: "snoozed" })}>Snooze</button>
        </div>
      </article>
    </section>
  );
}

function History({ view, onMessage }: { view: PanelView; onMessage: (message: PanelToHost) => void }) {
  const [query, setQuery] = useState("");
  return (
    <section aria-label="Task history">
      <h2>History</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onMessage({ schemaVersion: 1, type: "search", query });
        }}
      >
        <label>
          Search history
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="submit">Search</button>
      </form>
      <ul>
        {view.history.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "select-task", taskId: item.id })}>
              {item.title}
            </button>
            <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "delete-task", taskId: item.id })}>Delete {item.title}</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "export" })}>Export history</button>
      <button type="button" onClick={() => onMessage({ schemaVersion: 1, type: "clear-data" })}>Clear local data</button>
    </section>
  );
}

function Onboarding({ onMessage }: { onMessage: (message: PanelToHost) => void }) {
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    goal: "learn",
    level: "intermediate",
    stack: [],
    concerns: [],
    detail: "balanced",
    interruption: "balanced",
    providerMode: "offline",
    privacyMode: "local-only",
    persistence: "local",
    retentionDays: 30,
  });
  return (
    <form
      aria-label="CraftLens onboarding"
      onSubmit={(event) => {
        event.preventDefault();
        onMessage({ schemaVersion: 1, type: "onboarding", answers });
      }}
    >
      <h2>Set up CraftLens</h2>
      <p>Nothing is sent to a provider until you add a key and choose a privacy mode other than local-only.</p>
      <label>
        What do you want?
        <select value={answers.goal} onChange={(event) => setAnswers({ ...answers, goal: event.target.value as OnboardingAnswers["goal"] })}>
          <option value="learn">Learn engineering</option>
          <option value="review">Review AI code</option>
          <option value="architecture">Architecture decisions</option>
          <option value="security">Security and reliability</option>
          <option value="minimal">Minimal noise</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>
        Level
        <select value={answers.level} onChange={(event) => setAnswers({ ...answers, level: event.target.value as OnboardingAnswers["level"] })}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="senior">Senior</option>
          <option value="expert">Expert</option>
        </select>
      </label>
      <label>
        Privacy
        <select value={answers.privacyMode} onChange={(event) => setAnswers({ ...answers, privacyMode: event.target.value as OnboardingAnswers["privacyMode"] })}>
          <option value="local-only">Local only</option>
          <option value="prompt-summary">Prompt summary only</option>
          <option value="diff-snippets">Changed-file names and prompt</option>
          <option value="workspace-context">Prompt and changed-file names</option>
        </select>
      </label>
      <button type="submit">Save and continue</button>
    </form>
  );
}

function clip(text: string, detail: PanelView["detail"]): string {
  const limit = detail === "concise" ? 160 : detail === "deep" ? 2000 : 400;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function phaseLabel(phase: PanelView["phase"]): string {
  return PHASE_LABEL[phase];
}
