import { z } from "zod";

export const isoTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "invalid time",
});

export const taskStatusSchema = z.enum([
  "idle",
  "prompt_captured",
  "brief_generating",
  "agent_working",
  "evidence_accumulating",
  "completion_detected",
  "review_generating",
  "review_ready",
  "waiting_for_engineer",
  "paused",
  "error",
  "unknown",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskCategorySchema = z.enum([
  "bug_fix",
  "feature",
  "refactor",
  "test",
  "architecture",
  "database",
  "security",
  "infrastructure",
  "docs",
  "unknown",
]);
export type TaskCategory = z.infer<typeof taskCategorySchema>;

export const evidenceStatusSchema = z.enum([
  "verified",
  "observed",
  "inferred",
  "unverified",
  "contradicted",
]);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export const eventSourceSchema = z.enum(["cursor-hook", "vscode", "git", "user", "analysis"]);
export type EventSource = z.infer<typeof eventSourceSchema>;

export const eventKindSchema = z.enum([
  "prompt.submitted",
  "session.started",
  "session.ended",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "file.edited",
  "agent.response",
  "agent.stopped",
  "git.diff.changed",
  "diagnostic.changed",
  "test.observed",
  "user.action",
]);
export type EventKind = z.infer<typeof eventKindSchema>;

export const evidenceRefSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["file", "diff", "command", "diagnostic", "event", "url", "user"]),
    available: z.boolean(),
    path: z.string().optional(),
    at: isoTimeSchema.optional(),
    limitation: z.string().optional(),
  })
  .strict();
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export const evidenceClaimSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    status: evidenceStatusSchema,
    evidence: z.array(evidenceRefSchema),
    limitation: z.string().optional(),
  })
  .strict();
export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;

export const changedFileSchema = z
  .object({
    relativePath: z.string().min(1),
    attribution: z.enum(["task", "pre-existing", "unknown"]),
    binary: z.boolean(),
    renamed: z.boolean(),
    protected: z.boolean(),
  })
  .strict();
export type ChangedFileRef = z.infer<typeof changedFileSchema>;

export const testRowSchema = z
  .object({
    id: z.string().min(1),
    commandSummary: z.string(),
    status: z.enum(["passed", "failed", "not-observed"]),
    detail: z.string().optional(),
  })
  .strict();
export type TestRow = z.infer<typeof testRowSchema>;

export const decisionCardSchema = z
  .object({
    id: z.string().min(1),
    createdAt: isoTimeSchema,
    updatedAt: isoTimeSchema,
    title: z.string().min(1),
    rationale: z.string().min(1),
    alternatives: z.array(z.string()),
    status: z.enum(["observed", "likely", "user-confirmed"]),
    provenance: z.string().min(1),
    tags: z.array(z.string()),
    evidence: z.array(evidenceRefSchema),
  })
  .strict();
export type DecisionCard = z.infer<typeof decisionCardSchema>;

export const riskCardSchema = z
  .object({
    id: z.string().min(1),
    createdAt: isoTimeSchema,
    updatedAt: isoTimeSchema,
    title: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]),
    domain: z.string().min(1),
    failureMode: z.string().min(1),
    impact: z.string().min(1),
    whyItMatters: z.string().min(1),
    verification: z.string().min(1),
    status: z.enum(["open", "validated", "not-applicable", "dismissed"]),
    confidence: z.enum(["verified", "likely", "needs-confirmation", "not-checked"]),
    provenance: z.string().min(1),
    tags: z.array(z.string()),
    principleId: z.string().optional(),
  })
  .strict();
export type RiskCard = z.infer<typeof riskCardSchema>;

export const actionCardSchema = z
  .object({
    id: z.string().min(1),
    createdAt: isoTimeSchema,
    updatedAt: isoTimeSchema,
    verb: z.string().min(1),
    rationale: z.string().min(1),
    effort: z.enum(["quick", "medium", "deep"]),
    benefit: z.string().min(1),
    status: z.enum(["open", "done", "snoozed", "not-applicable"]),
    why: z.string().min(1),
    provenance: z.string().min(1),
    tags: z.array(z.string()),
  })
  .strict();
export type ActionCard = z.infer<typeof actionCardSchema>;

export const validationSummarySchema = z
  .object({
    changedFiles: z.array(changedFileSchema),
    tests: z.array(testRowSchema),
    diagnostics: z
      .object({
        state: z.enum(["observed", "not-observed"]),
        errorCount: z.number().int().nonnegative().optional(),
        warningCount: z.number().int().nonnegative().optional(),
      })
      .strict(),
    git: z
      .object({
        state: z.enum(["available", "no-git", "not-a-repo", "unavailable"]),
        summary: z.string(),
        limitation: z.string().optional(),
      })
      .strict(),
    remainingChecks: z.array(z.string()),
    acceptance: z.array(evidenceClaimSchema),
  })
  .strict();
export type ValidationSummary = z.infer<typeof validationSummarySchema>;

export const analysisStatusSchema = z.enum([
  "not-started",
  "running",
  "complete",
  "partial",
  "error",
]);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const gitBaselineSchema = z
  .object({
    captured: z.boolean(),
    paths: z.array(z.string()),
    limitation: z.string().optional(),
  })
  .strict();
export type GitBaseline = z.infer<typeof gitBaselineSchema>;

export const taskRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    workspaceId: z.string().regex(/^[a-f0-9]{24}$/),
    sessionId: z.string().min(1).optional(),
    parentTaskId: z.string().optional(),
    createdAt: isoTimeSchema,
    updatedAt: isoTimeSchema,
    status: taskStatusSchema,
    promptSummary: z.string(),
    promptStored: z.boolean(),
    category: taskCategorySchema,
    inferredGoals: z.array(evidenceClaimSchema),
    changedFiles: z.array(changedFileSchema),
    decisions: z.array(decisionCardSchema),
    risks: z.array(riskCardSchema),
    actions: z.array(actionCardSchema),
    validation: validationSummarySchema,
    analysisStatus: analysisStatusSchema,
    profileId: z.string().min(1),
    gitBaseline: gitBaselineSchema,
    analysisMeta: z
      .object({
        provider: z.string(),
        model: z.string().optional(),
        privacyMode: z.string(),
        requestCount: z.number().int().nonnegative(),
        durationMs: z.number().nonnegative().optional(),
        contextSources: z.array(z.string()),
        limitation: z.string().optional(),
      })
      .strict(),
  })
  .strict();
export type TaskRecordV1 = z.infer<typeof taskRecordSchema>;

const eventBase = {
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  occurredAt: isoTimeSchema,
  source: eventSourceSchema,
  workspaceId: z.string().regex(/^[a-f0-9]{24}$/),
  sessionId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
};

function eventSchema<Kind extends string, Payload extends z.ZodTypeAny>(kind: Kind, payload: Payload) {
  return z.object({ ...eventBase, kind: z.literal(kind), payload }).strict();
}

export const companionEventSchema = z.discriminatedUnion("kind", [
  eventSchema(
    "prompt.submitted",
    z.object({ text: z.string().max(20_000), redacted: z.boolean(), attachmentCount: z.number().int().nonnegative() }).strict(),
  ),
  eventSchema(
    "session.started",
    z.object({ isBackgroundAgent: z.boolean().optional(), composerMode: z.string().optional() }).strict(),
  ),
  eventSchema(
    "session.ended",
    z.object({ reason: z.string(), durationMs: z.number().nonnegative().optional() }).strict(),
  ),
  eventSchema(
    "tool.started",
    z.object({ toolName: z.string(), toolUseId: z.string().optional() }).strict(),
  ),
  eventSchema(
    "tool.completed",
    z
      .object({
        toolName: z.string(),
        toolUseId: z.string().optional(),
        durationMs: z.number().nonnegative().optional(),
        commandSummary: z.string().optional(),
        outputSummary: z.string().optional(),
        exitCode: z.number().int().optional(),
      })
      .strict(),
  ),
  eventSchema(
    "tool.failed",
    z.object({ toolName: z.string(), toolUseId: z.string().optional(), failureSummary: z.string() }).strict(),
  ),
  eventSchema(
    "file.edited",
    z
      .object({
        relativePath: z.string().min(1),
        editCount: z.number().int().nonnegative(),
        protectedFile: z.boolean(),
      })
      .strict(),
  ),
  eventSchema("agent.response", z.object({ textSummary: z.string().max(4_000) }).strict()),
  eventSchema(
    "agent.stopped",
    z.object({ status: z.enum(["completed", "aborted", "error"]), loopCount: z.number().int().nonnegative() }).strict(),
  ),
  eventSchema(
    "git.diff.changed",
    z.object({ available: z.boolean(), summary: z.string(), limitation: z.string().optional() }).strict(),
  ),
  eventSchema(
    "diagnostic.changed",
    z
      .object({
        errorCount: z.number().int().nonnegative(),
        warningCount: z.number().int().nonnegative(),
        fileCount: z.number().int().nonnegative(),
      })
      .strict(),
  ),
  eventSchema(
    "test.observed",
    z
      .object({
        commandSummary: z.string(),
        status: z.enum(["passed", "failed", "not-observed"]),
        detail: z.string().optional(),
      })
      .strict(),
  ),
  eventSchema(
    "user.action",
    z.object({ action: z.string(), cardId: z.string().optional(), note: z.string().optional() }).strict(),
  ),
]);
export type CompanionEventV1 = z.infer<typeof companionEventSchema>;

export const analysisResultSchema = z
  .object({
    summary: z.string(),
    observedFacts: z.array(evidenceClaimSchema),
    decisions: z.array(decisionCardSchema),
    alternatives: z.array(z.string()),
    risks: z.array(riskCardSchema),
    nextActions: z.array(actionCardSchema),
    validationChecks: z.array(z.string()),
    unknowns: z.array(z.string()),
    evidence: z.array(evidenceRefSchema),
    analysisMetadata: z
      .object({
        provider: z.string(),
        model: z.string().optional(),
        at: isoTimeSchema,
        contextSources: z.array(z.string()),
        privacyMode: z.string(),
        durationMs: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const profileIdSchema = z.enum([
  "learn",
  "senior-reviewer",
  "architect",
  "reliability-security",
  "performance-cost",
  "minimal-noise",
  "custom",
]);
export type ProfileId = z.infer<typeof profileIdSchema>;

export const privacyModeSchema = z.enum([
  "local-only",
  "prompt-summary",
  "diff-snippets",
  "workspace-context",
]);
export type PrivacyMode = z.infer<typeof privacyModeSchema>;

export const onboardingSchema = z
  .object({
    goal: z.enum(["learn", "review", "architecture", "security", "minimal", "custom"]),
    level: z.enum(["beginner", "intermediate", "senior", "expert"]),
    stack: z.array(z.string()).max(20),
    concerns: z.array(z.string()).max(20),
    detail: z.enum(["concise", "balanced", "deep"]),
    interruption: z.enum(["quiet", "balanced", "proactive"]),
    providerMode: z.enum(["offline", "openai-compatible"]),
    privacyMode: privacyModeSchema,
    persistence: z.enum(["session", "local", "off"]),
    retentionDays: z.number().int().min(1).max(365),
  })
  .strict();
export type OnboardingAnswers = z.infer<typeof onboardingSchema>;

export const historyItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: taskStatusSchema,
    updatedAt: isoTimeSchema,
    pinned: z.boolean(),
  })
  .strict();

export const panelViewSchema = z
  .object({
    schemaVersion: z.literal(1),
    connection: z.enum(["synthetic", "live", "disconnected", "manual"]),
    connectionDetail: z.string(),
    privacyMode: privacyModeSchema,
    profileId: profileIdSchema,
    compact: z.boolean(),
    quiet: z.boolean(),
    onboarded: z.boolean(),
    detail: z.enum(["concise", "balanced", "deep"]),
    level: z.enum(["beginner", "intermediate", "senior", "expert"]),
    phase: z.enum([
      "empty",
      "preparing",
      "working",
      "review",
      "waiting",
      "paused",
      "error",
      "offline",
      "disconnected",
    ]),
    offline: z.boolean(),
    task: taskRecordSchema.nullable(),
    history: z.array(historyItemSchema),
    notice: z.string().optional(),
    checklistText: z.string(),
  })
  .strict();
export type PanelView = z.infer<typeof panelViewSchema>;

export const panelToHostSchema = z.discriminatedUnion("type", [
  z.object({ schemaVersion: z.literal(1), type: z.literal("ready") }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("toggle-compact") }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("toggle-quiet") }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("pause") }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("resume") }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("reanalyze") }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("load-synthetic") }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("clear-data") }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("search"), query: z.string().max(200) }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("delete-task"), taskId: z.string().min(1) }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("export") }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("select-task"), taskId: z.string().min(1) }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("pin") }).strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      type: z.literal("action"),
      taskId: z.string().min(1),
      cardId: z.string().min(1),
      status: z.enum(["done", "snoozed", "not-applicable", "open"]),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      type: z.literal("feedback"),
      taskId: z.string().min(1),
      cardId: z.string().min(1),
      useful: z.boolean(),
      note: z.string().max(500).optional(),
    })
    .strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("onboarding"), answers: onboardingSchema }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("open-file"), path: z.string().min(1) }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("copy-checklist") }).strict(),
]);
export type PanelToHost = z.infer<typeof panelToHostSchema>;

export const hostToPanelSchema = z.discriminatedUnion("type", [
  z.object({ schemaVersion: z.literal(1), type: z.literal("state"), state: panelViewSchema }).strict(),
  z.object({ schemaVersion: z.literal(1), type: z.literal("error"), message: z.string() }).strict(),
]);
export type HostToPanel = z.infer<typeof hostToPanelSchema>;

export const principleSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    domain: z.string().min(1),
    summary: z.string().min(1),
    applicabilitySignals: z.array(z.string().min(1)).min(1),
    principle: z.string().min(1),
    whyItMatters: z.string().min(1),
    whenToApply: z.string().min(1),
    whenNotToApply: z.string().min(1),
    commonFailureModes: z.array(z.string()).min(1),
    verificationSteps: z.array(z.string()).min(1),
    evidenceNeeded: z.array(z.string()).min(1),
    tradeoffs: z.array(z.string()).min(1),
    example: z.string().min(1),
    sources: z.array(z.object({ title: z.string().min(1), url: z.string().url() }).strict()).min(1),
    severityGuidance: z.enum(["low", "medium", "high"]),
    relatedPrinciples: z.array(z.string()),
    tags: z.array(z.string()),
  })
  .strict();
export type Principle = z.infer<typeof principleSchema>;

export const userSettingsSchema = z
  .object({
    profileId: profileIdSchema,
    level: z.enum(["beginner", "intermediate", "senior", "expert"]),
    detail: z.enum(["concise", "balanced", "deep"]),
    interruption: z.enum(["quiet", "balanced", "proactive"]),
    privacyMode: privacyModeSchema,
    persistence: z.enum(["session", "local", "off"]),
    retentionDays: z.number().int().min(1).max(365),
    providerBaseUrl: z.string(),
    providerModel: z.string(),
    concerns: z.array(z.string()),
    stack: z.array(z.string()),
    quiet: z.boolean(),
    compact: z.boolean(),
    onboarded: z.boolean(),
  })
  .strict();
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_SETTINGS: UserSettings = {
  profileId: "learn",
  level: "intermediate",
  detail: "balanced",
  interruption: "balanced",
  privacyMode: "prompt-summary",
  persistence: "local",
  retentionDays: 30,
  providerBaseUrl: "",
  providerModel: "auto",
  concerns: [],
  stack: [],
  quiet: false,
  compact: false,
  onboarded: true,
};

export function emptyValidation(): ValidationSummary {
  return {
    changedFiles: [],
    tests: [],
    diagnostics: { state: "not-observed" },
    git: { state: "unavailable", summary: "Git has not been queried for this task." },
    remainingChecks: [],
    acceptance: [],
  };
}

export function assertNoSecretFields(value: unknown): void {
  const text = JSON.stringify(value);
  if (/\b(apiKey|api_key|authorization|secretStorage)\b/i.test(text) && /sk-[A-Za-z0-9]/.test(text)) {
    throw new Error("secret material in payload");
  }
}
