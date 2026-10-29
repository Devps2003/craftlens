import { principleSchema, type Principle } from "@craftlens/contracts";
import rawPrinciples from "./principles.json";

export function loadPrinciples(input: unknown = rawPrinciples): Principle[] {
  const parsed = principleSchema.array().parse(input);
  const ids = new Set<string>();
  for (const principle of parsed) {
    if (ids.has(principle.id)) throw new Error(`duplicate principle ${principle.id}`);
    ids.add(principle.id);
  }
  return parsed;
}

export function selectPrinciples(input: {
  principles: Principle[];
  text: string;
  paths: string[];
  category: string;
  dismissedIds: string[];
  limit?: number;
}): Principle[] {
  const haystack = `${input.text} ${input.paths.join(" ")} ${input.category}`.toLowerCase();
  const dismissed = new Set(input.dismissedIds);
  const ranked = input.principles
    .filter((principle) => !dismissed.has(principle.id))
    .map((principle) => ({
      principle,
      score: principle.applicabilitySignals.reduce(
        (total, signal) => total + (haystack.includes(signal.toLowerCase()) ? 1 : 0),
        0,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.principle.id.localeCompare(b.principle.id));
  return ranked.slice(0, input.limit ?? 3).map((item) => item.principle);
}
