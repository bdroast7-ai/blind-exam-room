import { db } from "@/db";
import { exams, players } from "@/db/schema";
import { getExamByCode, getPlayerByToken, normalizePlayerName } from "@/lib/exam";
import { and, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const exam = await getExamByCode(code);
  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  const me = await getPlayerByToken(exam.id, req.headers.get("x-player-token"));
  if (!me) return Response.json({ error: "Join the exam first" }, { status: 403 });
  if (exam.status !== "lobby") return Response.json({ ok: true });

  const isHost = normalizePlayerName(me.name) === normalizePlayerName(exam.hostName ?? "");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(players)
    .where(eq(players.examId, exam.id));

  if (!isHost && Number(count) < 4) {
    return Response.json({ error: "Only the host can start until all 4 players are in the room." }, { status: 403 });
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + exam.durationMin * 60_000);
  await db
    .update(exams)
    .set({ status: "running", startedAt: now, endsAt })
    .where(and(eq(exams.id, exam.id), eq(exams.status, "lobby")));
  return Response.json({ ok: true });
}
