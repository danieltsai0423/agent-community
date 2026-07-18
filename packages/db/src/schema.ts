import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const quests = sqliteTable("quests", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id")
    .notNull()
    .references(() => users.id),
  type: text("type", { enum: ["arena"] })
    .notNull()
    .default("arena"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["active", "settled"] })
    .notNull()
    .default("active"),
  deadline: integer("deadline", { mode: "timestamp" }).notNull(),
  // 結算時間;null = 尚未結算
  settledAt: integer("settled_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  questId: text("quest_id")
    .notNull()
    .references(() => quests.id),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  status: text("status", { enum: ["pending", "approved", "flagged"] })
    .notNull()
    .default("pending"),
  // 結算時寫入,一經發布不可變;null = 尚未結算
  finalRank: integer("final_rank"),
  finalVotes: integer("final_votes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    questId: text("quest_id")
      .notNull()
      .references(() => quests.id),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id),
    voterId: text("voter_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    // 一人一 Quest 一票(見 specs/02-db-schema.md)
    uniqueIndex("votes_quest_voter_unique").on(table.questId, table.voterId),
  ],
);
