import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "invalid-request"
  | "turnstile-failed"
  | "quest-not-found"
  | "quest-not-active"
  | "past-deadline"
  | "submission-not-votable"
  | "creator-cannot-vote"
  | "already-voted"
  | "rate-limited";

/** code 給機器判斷(英文),message 直接顯示給使用者(繁中、無技術術語)。 */
const MESSAGES: Record<ErrorCode, string> = {
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

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  "invalid-request": 400,
  "turnstile-failed": 403,
  "quest-not-found": 404,
  "quest-not-active": 409,
  "past-deadline": 409,
  "submission-not-votable": 409,
  "creator-cannot-vote": 409,
  "already-voted": 409,
  "rate-limited": 429,
};

export function apiError(c: Context, code: ErrorCode) {
  return c.json({ error: { code, message: MESSAGES[code] } }, STATUS[code]);
}
