import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull().default("Weekend Exam"),
  questionCount: integer("question_count").notNull(),
  durationMin: integer("duration_min").notNull(),
  negativeMark: real("negative_mark").notNull().default(0),
  status: text("status").notNull().default("lobby"), // lobby | running | finished
  source: text("source").notNull().default("gemini"), // gemini | demo
  hostName: text("host_name"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id")
    .notNull()
    .references(() => exams.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  subject: text("subject").notNull(),
  subTopic: text("sub_topic").notNull(),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  explanation: text("explanation").notNull(),
});

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    token: text("token").notNull(),
    answers: jsonb("answers").$type<Record<string, number>>().notNull().default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("players_exam_name_idx").on(t.examId, t.name)],
);
