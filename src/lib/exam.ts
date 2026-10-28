import { db } from "@/db";
import { exams, players, questions } from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  ExamResults,
  ExamState,
  PlayerResult,
  SubjectStat,
  TopicStat,
} from "./types";
import { SUBJECTS } from "./types";

export type ExamRow = typeof exams.$inferSelect;

export const GRACE_MS = 3000;

export function accuracyLabel(acc: number): string {
  if (acc >= 80) return "Strong";
  if (acc >= 60) return "Good";
  if (acc >= 50) return "Average";
  if (acc >= 30) return "Weak";
  return "Critical";
}

export function normalizePlayerName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .toLowerCase();
}

export async function getExamByCode(code: string) {
  const [e] = await db.select().from(exams).where(eq(exams.code, code)).limit(1);
  return e ?? null;
}

/** Moves a running exam to finished when time is up or all players submitted. */
export async function syncStatus(exam: ExamRow): Promise<ExamRow> {
  if (exam.status !== "running") return exam;
  let finish = false;
  if (exam.endsAt && Date.now() >= exam.endsAt.getTime()) finish = true;
  if (!finish) {
    const ps = await db
      .select({ submittedAt: players.submittedAt })
      .from(players)
      .where(eq(players.examId, exam.id));
    if (ps.length > 0 && ps.every((p) => p.submittedAt)) finish = true;
  }
  if (finish) {
    const [u] = await db
      .update(exams)
      .set({ status: "finished" })
      .where(eq(exams.id, exam.id))
      .returning();
    return u;
  }
  return exam;
}

export async function getPlayerByToken(examId: number, token: string | null) {
  if (!token) return null;
  const [p] = await db
    .select()
    .from(players)
    .where(and(eq(players.examId, examId), eq(players.token, token)))
    .limit(1);
  return p ?? null;
}

export async function buildState(exam: ExamRow, token: string | null): Promise<ExamState> {
  const ps = await db
    .select()
    .from(players)
    .where(eq(players.examId, exam.id))
    .orderBy(asc(players.joinedAt));
  const me = token ? ps.find((p) => p.token === token) ?? null : null;
  let qs: ExamState["questions"] = null;
  if (exam.status !== "lobby" && me) {
    // NOTE: never select correctIndex / explanation here.
    qs = await db
      .select({
        id: questions.id,
        idx: questions.idx,
        subject: questions.subject,
        subTopic: questions.subTopic,
        question: questions.question,
        options: questions.options,
      })
      .from(questions)
      .where(eq(questions.examId, exam.id))
      .orderBy(asc(questions.idx));
  }
  return {
    code: exam.code,
    title: exam.title,
    status: exam.status as ExamState["status"],
    source: exam.source,
    questionCount: exam.questionCount,
    durationMin: exam.durationMin,
    negativeMark: exam.negativeMark,
    hostName: exam.hostName,
    startedAt: exam.startedAt?.toISOString() ?? null,
    endsAt: exam.endsAt?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
    players: ps.map((p) => ({
      id: p.id,
      name: p.name,
      submitted: !!p.submittedAt,
      answeredCount: Object.keys(p.answers ?? {}).length,
    })),
    questions: qs,
    me: me
      ? { id: me.id, name: me.name, answers: me.answers ?? {}, submitted: !!me.submittedAt }
      : null,
  };
}

type QLite = { id: number; subject: string; subTopic: string; correctIndex: number };

function gradePlayer(qs: QLite[], answers: Record<string, number>, neg: number) {
  let correct = 0,
    wrong = 0,
    skipped = 0;
  const subj = new Map<string, SubjectStat>();
  const topic = new Map<string, TopicStat>();
  for (const q of qs) {
    const a = answers[String(q.id)];
    const s =
      subj.get(q.subject) ??
      { subject: q.subject, correct: 0, wrong: 0, skipped: 0, total: 0, accuracy: 0, label: "" };
    const tk = `${q.subject}|${q.subTopic}`;
    const t = topic.get(tk) ?? { subject: q.subject, subTopic: q.subTopic, correct: 0, total: 0, accuracy: 0 };
    s.total++;
    t.total++;
    if (a === undefined || a === null) {
      skipped++;
      s.skipped++;
    } else if (a === q.correctIndex) {
      correct++;
      s.correct++;
      t.correct++;
    } else {
      wrong++;
      s.wrong++;
    }
    subj.set(q.subject, s);
    topic.set(tk, t);
  }
  const subjects = [...subj.values()]
    .map((s) => {
      const accuracy = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      return { ...s, accuracy, label: accuracyLabel(accuracy) };
    })
    .sort((a, b) => SUBJECTS.indexOf(a.subject as never) - SUBJECTS.indexOf(b.subject as never));
  const topics = [...topic.values()].map((t) => ({
    ...t,
    accuracy: t.total ? Math.round((t.correct / t.total) * 100) : 0,
  }));
  const weakSubjects = subjects
    .filter((s) => s.accuracy < 50)
    .sort((a, b) => a.accuracy - b.accuracy)
    .map((s) => ({
      subject: s.subject,
      accuracy: s.accuracy,
      topics: topics
        .filter((t) => t.subject === s.subject && t.accuracy < 50)
        .sort((a, b) => a.accuracy - b.accuracy)
        .map((t) => t.subTopic),
    }));
  const score = Math.round((correct - wrong * neg) * 100) / 100;
  return { correct, wrong, skipped, score, subjects, topics, weakSubjects };
}

/** Combined subject accuracy across this player's last 3 finished exams (matched by name). */
async function historyFor(name: string) {
  const rows = await db
    .select({ examId: exams.id, answers: players.answers, endsAt: exams.endsAt })
    .from(players)
    .innerJoin(exams, eq(players.examId, exams.id))
    .where(and(eq(exams.status, "finished"), sql`lower(trim(${players.name})) = lower(trim(${name}))`))
    .orderBy(desc(exams.endsAt))
    .limit(3);
  if (!rows.length) return { exams: 0, subjects: [] };
  const qs = await db
    .select({ id: questions.id, examId: questions.examId, subject: questions.subject, correctIndex: questions.correctIndex })
    .from(questions)
    .where(inArray(questions.examId, rows.map((r) => r.examId)));
  const agg = new Map<string, { c: number; t: number }>();
  for (const r of rows) {
    for (const q of qs.filter((x) => x.examId === r.examId)) {
      const a = agg.get(q.subject) ?? { c: 0, t: 0 };
      a.t++;
      if ((r.answers ?? {})[String(q.id)] === q.correctIndex) a.c++;
      agg.set(q.subject, a);
    }
  }
  return {
    exams: rows.length,
    subjects: [...agg.entries()].map(([subject, v]) => {
      const accuracy = v.t ? Math.round((v.c / v.t) * 100) : 0;
      return { subject, accuracy, total: v.t, flagged: accuracy < 50 };
    }),
  };
}

export async function buildResults(exam: ExamRow): Promise<ExamResults> {
  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, exam.id))
    .orderBy(asc(questions.idx));
  const ps = await db
    .select()
    .from(players)
    .where(eq(players.examId, exam.id))
    .orderBy(asc(players.joinedAt));

  const graded = await Promise.all(
    ps.map(async (p) => {
      const g = gradePlayer(qs, p.answers ?? {}, exam.negativeMark);
      const history = await historyFor(p.name);
      return { id: p.id, name: p.name, answers: p.answers ?? {}, ...g, history, rank: 0 };
    }),
  );
  graded.sort((a, b) => b.score - a.score || b.correct - a.correct);
  let rank = 0;
  let prev: number | null = null;
  graded.forEach((g, i) => {
    if (prev === null || g.score !== prev) rank = i + 1;
    g.rank = rank;
    prev = g.score;
  });

  return {
    code: exam.code,
    title: exam.title,
    negativeMark: exam.negativeMark,
    questionCount: qs.length,
    source: exam.source,
    questions: qs.map((q) => ({
      id: q.id,
      idx: q.idx,
      subject: q.subject,
      subTopic: q.subTopic,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
    })),
    players: graded as PlayerResult[],
  };
}

export async function generateCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await getExamByCode(code);
    if (!existing) return code;
  }
  throw new Error("Could not generate code");
}

export function newToken() {
  return crypto.randomUUID();
}
