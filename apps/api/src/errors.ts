import { API_ERROR_MESSAGES, type ApiErrorCode } from "@tavern/core";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode = ApiErrorCode;

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
  return c.json({ error: { code, message: API_ERROR_MESSAGES[code] } }, STATUS[code]);
}
