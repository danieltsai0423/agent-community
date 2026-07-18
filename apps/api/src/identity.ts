import { users } from "@tavern/db";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

const COOKIE_NAME = "tavern_uid";
const ONE_YEAR_S = 365 * 24 * 60 * 60;
const DEFAULT_NAME = "匿名冒險者";

/**
 * P0 匿名身分:tavern_uid cookie(隨機 UUID)。
 * 首次寫入時建 users 列;之後帶 displayName 會更新名字。
 */
export async function ensureUser(
  c: Context,
  db: DrizzleD1Database,
  displayName?: string,
): Promise<string> {
  const uid = getCookie(c, COOKIE_NAME) ?? crypto.randomUUID();

  const row = { id: uid, email: null, displayName: displayName ?? DEFAULT_NAME, createdAt: new Date() };
  if (displayName) {
    await db
      .insert(users)
      .values(row)
      .onConflictDoUpdate({ target: users.id, set: { displayName } });
  } else {
    await db.insert(users).values(row).onConflictDoNothing();
  }

  setCookie(c, COOKIE_NAME, uid, {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
    path: "/",
    maxAge: ONE_YEAR_S,
  });
  return uid;
}

export function currentUserId(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME);
}
