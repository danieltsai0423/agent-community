export type ModerationOutcome = "safe" | "unsafe" | "unavailable";

export type SubmissionStatus = "pending" | "approved" | "flagged";

/**
 * 審核決策:安全 → 公開;不安全 → 標記不公開;
 * 無法判讀(AI 失敗等)→ pending 佇列等待再審 —— fail-closed,絕不直接公開。
 */
export function decideSubmissionStatus(outcome: ModerationOutcome): SubmissionStatus {
  switch (outcome) {
    case "safe":
      return "approved";
    case "unsafe":
      return "flagged";
    case "unavailable":
      return "pending";
  }
}
