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
  const choice = body.choice;
  if (!Number.isInteger(choice) || choice! < 0 || choice! > 3) {
    return Response.json({ error: "Choose one valid option" }, { status: 400 });
  }

  const [q] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.id, qid), eq(questions.examId, exam.id)))
    .limit(1);
  if (!q) return Response.json({ error: "Bad question" }, { status: 400 });

  // Lock the participant row so two near-simultaneous clicks cannot overwrite
  // each other. The first saved choice wins permanently for this question.
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: players.id }).from(players).where(eq(players.id, me.id)).for("update");
    const [freshPlayer] = await tx
      .select({ answers: players.answers })
      .from(players)
      .where(eq(players.id, me.id))
      .limit(1);

    if (!freshPlayer) return "missing" as const;
    const answers = freshPlayer.answers ?? {};
    if (Object.prototype.hasOwnProperty.call(answers, String(qid))) return "already-answered" as const;

    await tx.update(players)
      .set({ answers: { ...answers, [String(qid)]: choice as number } })
      .where(eq(players.id, me.id));
    return "saved" as const;
  });

  if (result === "missing") return Response.json({ error: "Participant not found" }, { status: 404 });
  if (result === "already-answered") {
    return Response.json({ error: "This answer is locked. You cannot change it." }, { status: 409 });
  }
  return Response.json({ ok: true });
}
