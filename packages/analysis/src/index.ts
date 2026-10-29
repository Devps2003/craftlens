import type {
  ActionCard,
  AnalysisResult,
  DecisionCard,
  EvidenceClaim,
  PrivacyMode,
  ProfileId,
  RiskCard,
  TaskCategory,
  TaskRecordV1,
} from "@craftlens/contracts";
import { loadPrinciples, selectPrinciples } from "@craftlens/knowledge";
import type { AnalysisProvider } from "@craftlens/providers";
import type { Principle } from "@craftlens/contracts";

export interface AnalyzeRequest {
  task: TaskRecordV1;
  profileId: ProfileId;
  privacyMode: PrivacyMode;
  provider: AnalysisProvider | null;
  apiKey: string;
  baseUrl: string;
  model: string;
  dismissedPrincipleIds: string[];
  signal: AbortSignal;
  now: string;
  timeoutMs?: number;
}

export interface AnalyzeOutcome {
  task: TaskRecordV1;
  requests: number;
  fallback: boolean;
}

const CATEGORY_RULES: { category: TaskCategory; pattern: RegExp }[] = [
  { category: "docs", pattern: /\b(readme|docs|changelog|documentation)\b/ },
  { category: "security", pattern: /\b(auth|secret|permission|token|jwt|password)\b/ },
  { category: "database", pattern: /\b(mongo|sql|migration|index|query|postgres)\b/ },
  { category: "infrastructure", pattern: /\b(deploy|docker|terraform|kubernetes|pipeline)\b/ },
  { category: "test", pattern: /\b(test|spec|vitest|jest|pytest)\b/ },
  { category: "architecture", pattern: /\b(architect|boundary|module|contract)\b/ },
  { category: "refactor", pattern: /\b(refactor|rename|extract)\b/ },
  { category: "bug_fix", pattern: /\b(bug|fix|error|fail|broken|regression)\b/ },
  { category: "feature", pattern: /\b(add|implement|create|build|introduce)\b/ },
];

export function classifyTask(prompt: string, paths: string[]): TaskCategory {
  const text = `${prompt} ${paths.join(" ")}`.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return "unknown";
}

export async function analyzeTask(request: AnalyzeRequest): Promise<AnalyzeOutcome> {
  const started = Date.now();
  const offline = offlineResult(request, started);
  if (request.privacyMode === "local-only" || !request.provider || !request.apiKey) {
    return { task: applyResult(request.task, offline, request.now, 0), requests: 0, fallback: true };
  }
  try {
    const remote = await request.provider.analyze(
      {
        promptSummary: request.privacyMode === "prompt-summary" ? request.task.promptSummary : request.task.promptSummary,
        category: offline.summary,
        files: request.privacyMode === "prompt-summary" ? [] : request.task.changedFiles.map((file) => file.relativePath),
        privacyMode: request.privacyMode,
        allowedContext:
          request.privacyMode === "prompt-summary"
            ? "summary"
            : request.privacyMode === "diff-snippets"
              ? "diff"
              : "workspace",
      },
      {
        timeoutMs: request.timeoutMs ?? 20_000,
        model: request.model || "gpt-4.1-mini",
        apiKey: request.apiKey,
        baseUrl: request.baseUrl,
      },
      request.signal,
    );
    const guarded = guardResult(remote, offline);
    return { task: applyResult(request.task, guarded, request.now, 1), requests: 1, fallback: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider failed";
    const withNote: AnalysisResult = {
      ...offline,
      unknowns: [...offline.unknowns, `Provider was not used: ${message}`],
    };
    return { task: applyResult(request.task, withNote, request.now, 1), requests: 1, fallback: true };
  }
}

function offlineResult(request: AnalyzeRequest, started: number): AnalysisResult {
  const prompt = request.task.promptSummary;
  const paths = request.task.changedFiles.map((file) => file.relativePath);
  const category = classifyTask(prompt, paths);
  const hint = profileHint(request.profileId);
  const principles = selectPrinciples({
    principles: loadPrinciples(),
    text: `${prompt} ${hint}`,
    paths,
    category,
    dismissedIds: request.dismissedPrincipleIds,
    limit: 3,
  });
  const observed = observedFacts(request.task);
  const decisions = decisionCards(request, category, principles);
  const risks = principles
    .filter((principle) => principle.commonFailureModes[0] && principle.verificationSteps[0])
    .map((principle) => riskFromPrinciple(principle, request.now));
  const action = actionFor(request, principles[0], category);
  const testsObserved = request.task.validation.tests.some((row) => row.status === "passed" || row.status === "failed");
  return {
    summary: summaryFor(prompt, category),
    observedFacts: observed,
    decisions,
    alternatives: principles.flatMap((principle) => principle.tradeoffs).slice(0, 3),
    risks,
    nextActions: [action],
    validationChecks: [
      ...principles.flatMap((principle) => principle.verificationSteps).slice(0, 4),
      testsObserved ? "A test command result was observed. Read that result before treating the change as checked." : "No test result was observed.",
    ],
    unknowns: request.task.gitBaseline.captured ? [] : ["Git baseline was not captured, so authorship of dirty files is incomplete."],
    evidence: observed.flatMap((fact) => fact.evidence),
    analysisMetadata: {
      provider: "offline",
      at: request.now,
      contextSources: ["prompt", "changed-files", "knowledge-pack"],
      privacyMode: request.privacyMode,
      durationMs: Date.now() - started,
    },
  };
}

function summaryFor(prompt: string, category: TaskCategory): string {
  if (!prompt) return "A task was opened before a prompt arrived. This brief is incomplete.";
  return `Preliminary ${category.replaceAll("_", " ")} reading of: ${prompt.slice(0, 180)}`;
}

function observedFacts(task: TaskRecordV1): EvidenceClaim[] {
  const facts: EvidenceClaim[] = [];
  if (task.promptStored) {
    facts.push({
      id: `goal_${task.id}`,
      text: `The prompt asks: ${task.promptSummary}`,
      status: "observed",
      evidence: [{ id: `ev_prompt_${task.id}`, label: "Prompt", kind: "event", available: true }],
    });
  }
  for (const file of task.changedFiles) {
    facts.push({
      id: `file_${file.relativePath}`,
      text: `${file.relativePath} changed (${file.attribution}${file.protected ? ", protected" : ""}${file.binary ? ", binary" : ""}${file.renamed ? ", renamed" : ""}).`,
      status: "observed",
      evidence: [{ id: `ev_${file.relativePath}`, label: file.relativePath, kind: "file", available: !file.binary, path: file.relativePath }],
      limitation: file.attribution === "pre-existing" ? "This file was already dirty at prompt time." : undefined,
    });
  }
  if (task.validation.tests.length === 0) {
    facts.push({
      id: `tests_${task.id}`,
      text: "No test result was observed.",
      status: "unverified",
      evidence: [],
      limitation: "Not observed is not a pass or a fail.",
    });
  }
  return facts;
}

function decisionCards(request: AnalyzeRequest, category: TaskCategory, principles: Principle[]): DecisionCard[] {
  const cards: DecisionCard[] = [
    {
      id: `decision_${request.task.id}`,
      createdAt: request.now,
      updatedAt: request.now,
      title: `Treat this as a ${category.replaceAll("_", " ")} until the diff says otherwise`,
      rationale: "The category comes from the prompt and file names. It is not a statement that the implementation is correct.",
      alternatives: ["Wait for the diff before naming a design", "Ask for the acceptance check you care about"],
      status: "likely",
      provenance: "inferred from prompt and changed file names",
      tags: ["classification"],
      evidence: [],
    },
  ];
  const top = principles[0];
  if (top && (request.profileId === "learn" || request.profileId === "architect")) {
    cards.push({
      id: `learn_${top.id}`,
      createdAt: request.now,
      updatedAt: request.now,
      title: top.principle,
      rationale: `${top.whyItMatters} When to use it: ${top.whenToApply} When not to: ${top.whenNotToApply} Example: ${top.example}`,
      alternatives: top.tradeoffs,
      status: "likely",
      provenance: `knowledge:${top.id}`,
      tags: ["learning", ...top.tags],
      evidence: top.sources.map((source) => ({
        id: `src_${top.id}`,
        label: source.title,
        kind: "url" as const,
        available: true,
        path: source.url,
      })),
    });
  }
  return cards;
}

function riskFromPrinciple(principle: Principle, now: string): RiskCard {
  return {
    id: `risk_${principle.id}`,
    createdAt: now,
    updatedAt: now,
    title: principle.summary,
    severity: principle.severityGuidance,
    domain: principle.domain,
    failureMode: principle.commonFailureModes[0] ?? "Unspecified failure",
    impact: principle.whyItMatters,
    whyItMatters: principle.whyItMatters,
    verification: principle.verificationSteps[0] ?? "Inspect the change",
    status: "open",
    confidence: "needs-confirmation",
    provenance: `knowledge:${principle.id}`,
    tags: principle.tags,
    principleId: principle.id,
  };
}

function actionFor(request: AnalyzeRequest, principle: Principle | undefined, category: TaskCategory): ActionCard {
  const verb = principle?.verificationSteps[0] ?? defaultVerb(category);
  return {
    id: `action_${request.task.id}`,
    createdAt: request.now,
    updatedAt: request.now,
    verb,
    rationale: principle ? principle.whyItMatters : "The prompt names an outcome. The diff is the thing to compare it with.",
    effort: "quick",
    benefit: "You check one concrete claim instead of rereading the whole change.",
    status: "open",
    why: "This is the highest-signal check available from the prompt and matched principles.",
    provenance: principle ? `knowledge:${principle.id}` : "offline-fallback",
    tags: principle?.tags ?? ["review"],
  };
}

function defaultVerb(category: TaskCategory): string {
  switch (category) {
    case "database":
      return "Open the query and compare its filter fields with an index";
    case "security":
      return "Trace who can call this path and where the object check lives";
    case "docs":
      return "Check that the doc matches the command or API it names";
    default:
      return "Compare the diff with the outcome named in the prompt";
  }
}

function statusAfterAnalysis(status: TaskRecordV1["status"]): TaskRecordV1["status"] {
  if (status === "completion_detected" || status === "review_generating" || status === "review_ready" || status === "waiting_for_engineer") {
    return "review_ready";
  }
  if (status === "paused" || status === "error" || status === "agent_working" || status === "evidence_accumulating") {
    return status;
  }
  return "brief_generating";
}

function profileHint(profile: ProfileId): string {
  switch (profile) {
    case "reliability-security":
      return "auth secret retry idempotency timeout";
    case "architect":
      return "api boundary module contract";
    case "performance-cost":
      return "index query latency cache";
    default:
      return "";
  }
}

function guardResult(remote: AnalysisResult, offline: AnalysisResult): AnalysisResult {
  const downgrade = <T extends { status?: string; evidence?: { kind: string; available: boolean }[] }>(items: T[]): T[] =>
    items.map((item) => {
      if (item.status !== "verified") return item;
      const backed = (item.evidence ?? []).some((ref) => ref.available && (ref.kind === "command" || ref.kind === "diagnostic" || ref.kind === "diff"));
      return backed ? item : { ...item, status: "inferred" };
    });
  return {
    ...remote,
    observedFacts: remote.observedFacts.length > 0 ? downgrade(remote.observedFacts) : offline.observedFacts,
    risks: remote.risks
      .filter((risk) => risk.failureMode && risk.verification)
      .slice(0, 3)
      .map((risk) => (risk.confidence === "verified" ? { ...risk, confidence: "needs-confirmation" as const } : risk)),
    nextActions: remote.nextActions.slice(0, 1).length > 0 ? remote.nextActions.slice(0, 1) : offline.nextActions,
    analysisMetadata: { ...remote.analysisMetadata, provider: remote.analysisMetadata.provider || "openai-compatible" },
  };
}

function applyResult(task: TaskRecordV1, result: AnalysisResult, now: string, requests: number): TaskRecordV1 {
  const category = classifyTask(task.promptSummary, task.changedFiles.map((file) => file.relativePath));
  return {
    ...task,
    updatedAt: now,
    status: statusAfterAnalysis(task.status),
    category,
    promptSummary: task.promptSummary,
    inferredGoals: result.observedFacts.filter((fact) => fact.id.startsWith("goal_")),
    decisions: result.decisions,
    risks: result.risks,
    actions: result.nextActions,
    validation: {
      ...task.validation,
      remainingChecks: result.validationChecks,
      acceptance: result.observedFacts.filter((fact) => fact.status !== "observed"),
    },
    analysisStatus: result.unknowns.some((item) => item.startsWith("Provider")) ? "partial" : "complete",
    analysisMeta: {
      provider: result.analysisMetadata.provider,
      model: result.analysisMetadata.model,
      privacyMode: result.analysisMetadata.privacyMode,
      requestCount: task.analysisMeta.requestCount + requests,
      durationMs: result.analysisMetadata.durationMs,
      contextSources: result.analysisMetadata.contextSources,
      limitation: result.unknowns.find((item) => item.startsWith("Provider")),
    },
  };
}

export class AnalysisScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly calls = new Map<string, number>();

  constructor(
    private readonly waitMs: number,
    private readonly maxCalls: number,
  ) {}

  schedule(taskId: string, run: () => void): "scheduled" | "capped" {
    if ((this.calls.get(taskId) ?? 0) >= this.maxCalls) return "capped";
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.calls.set(taskId, (this.calls.get(taskId) ?? 0) + 1);
      run();
    }, this.waitMs);
    return "scheduled";
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
