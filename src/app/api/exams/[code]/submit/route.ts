import { db } from "@/db";
import { players } from "@/db/schema";
import { getExamByCode, getPlayerByToken, syncStatus } from "@/lib/exam";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const exam = await getExamByCode(code);
  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  const me = await getPlayerByToken(exam.id, req.headers.get("x-player-token"));
  if (!me) return Response.json({ error: "Not a participant" }, { status: 403 });
  if (exam.status !== "running") return Response.json({ ok: true });
  if (!me.submittedAt) {
    await db.update(players).set({ submittedAt: new Date() }).where(eq(players.id, me.id));
  }
  const synced = await syncStatus(exam);
  return Response.json({ ok: true, status: synced.status });
}
