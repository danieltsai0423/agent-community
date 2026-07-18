export type ApiErrorCode =
  | "invalid-request"
  | "turnstile-failed"
  | "quest-not-found"
  | "quest-not-active"
  | "past-deadline"
  | "submission-not-votable"
  | "creator-cannot-vote"
  | "already-voted"
  | "rate-limited";

/**
 * code 給機器判斷(英文),message 直接顯示給使用者(繁中、無技術術語)。
 * api 回應與 web flash 共用這份表,文案只維護一處。
 */
export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  "invalid-request": "輸入格式不正確,請檢查後再試一次",
  "turnstile-failed": "安全驗證未通過,請重新整理頁面再試一次",
  "quest-not-found": "找不到這個擂台",
  "quest-not-active": "這個擂台已經結束了",
  "past-deadline": "這個擂台已過截止時間",
  "submission-not-votable": "這件作品目前不能投票",
  "creator-cannot-vote": "發起人不能在自己的擂台投票",
  "already-voted": "你已經投過票了,一人一票喔",
  "rate-limited": "操作太頻繁,請稍等一下再試",
};
