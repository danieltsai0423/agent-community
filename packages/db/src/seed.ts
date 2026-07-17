import type { DrizzleD1Database } from "drizzle-orm/d1";
import { quests, submissions, users } from "./schema.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 塞入一個示範 Quest(進行中、含兩件已核可作品),供本地開發與測試用。
 * 回傳建立的 id,方便測試查驗。
 */
export async function seedDemo(db: DrizzleD1Database, now: Date = new Date()) {
  const creator = {
    id: crypto.randomUUID(),
    email: "demo@tavern.local",
    displayName: "酒館老闆",
    createdAt: now,
  };
  const contributors = [
    { id: crypto.randomUUID(), email: null, displayName: "路過的吟遊詩人", createdAt: now },
    { id: crypto.randomUUID(), email: null, displayName: "新手冒險者", createdAt: now },
  ];
  await db.insert(users).values([creator, ...contributors]);

  const quest = {
    id: crypto.randomUUID(),
    creatorId: creator.id,
    type: "arena" as const,
    title: "讓你的 AI 用台語寫一首關於週一的詩",
    description:
      "把下面這段話貼給你的 AI:「請用台語寫一首四句的短詩,主題是星期一早上不想上班的心情。」然後把它的回答貼回來參賽!",
    status: "active" as const,
    deadline: new Date(now.getTime() + 7 * DAY_MS),
    createdAt: now,
  };
  await db.insert(quests).values(quest);

  const demoSubmissions = contributors.map((author, i) => ({
    id: crypto.randomUUID(),
    questId: quest.id,
    authorId: author.id,
    content:
      i === 0
        ? "拜一透早目睭金,棉被牽牽毋放人。鬧鐘咧哮我咧睏,心內咒罵天未光。"
        : "禮拜一,厚眠夢,愛睏神仔來作弄。咖啡啉落猶原愛,床鋪叫我轉去睏。",
    status: "approved" as const,
    createdAt: now,
  }));
  await db.insert(submissions).values(demoSubmissions);

  return {
    creatorId: creator.id,
    questId: quest.id,
    submissionIds: demoSubmissions.map((s) => s.id),
  };
}
