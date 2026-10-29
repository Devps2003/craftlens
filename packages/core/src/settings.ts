import {
  DEFAULT_SETTINGS,
  type OnboardingAnswers,
  type ProfileId,
  type UserSettings,
} from "@craftlens/contracts";

export function resolveSettings(user: UserSettings, workspace: Partial<UserSettings> | undefined): UserSettings {
  const merged: UserSettings = { ...user, ...stripPrivacy(workspace) };
  return merged;
}

function stripPrivacy(workspace: Partial<UserSettings> | undefined): Partial<UserSettings> {
  if (!workspace) return {};
  const { privacyMode: _privacy, persistence: _persistence, ...rest } = workspace;
  return rest;
}

export function settingsFromOnboarding(answers: OnboardingAnswers): UserSettings {
  const profileId: ProfileId =
    answers.goal === "learn"
      ? "learn"
      : answers.goal === "review"
        ? "senior-reviewer"
        : answers.goal === "architecture"
          ? "architect"
          : answers.goal === "security"
            ? "reliability-security"
            : answers.goal === "minimal"
              ? "minimal-noise"
              : "custom";
  return {
    ...DEFAULT_SETTINGS,
    profileId,
    level: answers.level,
    detail: answers.detail,
    interruption: answers.interruption,
    quiet: answers.interruption === "quiet",
    privacyMode: answers.privacyMode,
    persistence: answers.persistence,
    retentionDays: answers.retentionDays,
    concerns: answers.concerns,
    stack: answers.stack,
    onboarded: true,
  };
}
