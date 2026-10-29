import type { AnalysisResult, PrivacyMode } from "@craftlens/contracts";

export interface AnalysisInput {
  promptSummary: string;
  category: string;
  files: string[];
  privacyMode: PrivacyMode;
  allowedContext: "none" | "summary" | "diff" | "workspace";
}

export interface AnalysisOptions {
  timeoutMs: number;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface ProviderValidation {
  ok: boolean;
  message: string;
}

export interface AnalysisProvider {
  id: string;
  capabilities: { structuredOutput: boolean; streaming: boolean; local: boolean };
  analyze(input: AnalysisInput, options: AnalysisOptions, signal: AbortSignal): Promise<AnalysisResult>;
  validateConfig(config: unknown): Promise<ProviderValidation>;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<FetchResponse>;
