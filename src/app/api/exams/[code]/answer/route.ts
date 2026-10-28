import { db } from "@/db";
import { players, questions } from "@/db/schema";
import { GRACE_MS, getExamByCode, getPlayerByToken } from "@/lib/exam";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as { questionId?: number; choice?: number | null };
  const exam = await getExamByCode(code);
  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  const me = await getPlayerByToken(exam.id, req.headers.get("x-player-token"));
  if (!me) return Response.json({ error: "Not a participant" }, { status: 403 });
  if (exam.status !== "running" || !exam.endsAt || Date.now() > exam.endsAt.getTime() + GRACE_MS) {
    return Response.json({ error: "Exam is not running" }, { status: 409 });
  }
  if (me.submittedAt) return Response.json({ error: "Already submitted" }, { status: 409 });

  const qid = Number(body.questionId);
  const [q] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.id, qid), eq(questions.examId, exam.id)))
    .limit(1);
  if (!q) return Response.json({ error: "Bad question" }, { status: 400 });

  const answers = { ...(me.answers ?? {}) };
  const choice = body.choice;
  if (choice === null || choice === undefined) delete answers[String(qid)];
  else if (Number.isInteger(choice) && choice >= 0 && choice <= 3) answers[String(qid)] = choice;
  else return Response.json({ error: "Bad choice" }, { status: 400 });

  await db.update(players).set({ answers }).where(eq(players.id, me.id));
  return Response.json({ ok: true, answered: Object.keys(answers).length });
}
