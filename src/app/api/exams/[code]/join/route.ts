import { db } from "@/db";
import { players } from "@/db/schema";
import { getExamByCode, newToken, normalizePlayerName } from "@/lib/exam";
import { and, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = normalizePlayerName(String(body.name ?? ""));
  if (!name) return Response.json({ error: "Enter your name" }, { status: 400 });
  const exam = await getExamByCode(code);
  if (!exam) return Response.json({ error: "No exam with that code" }, { status: 404 });

  // Re-join with same name (e.g. phone refreshed / switched device)
  const [existing] = await db
    .select()
    .from(players)
    .where(and(eq(players.examId, exam.id), sql`lower(trim(${players.name})) = lower(${name})`))
    .limit(1);
  if (existing) return Response.json({ token: existing.token, name: existing.name });

  if (exam.status !== "lobby") {
    return Response.json({ error: "This exam has already started — late entry is closed." }, { status: 409 });
  }

  const token = newToken();
  try {
    await db.insert(players).values({ examId: exam.id, name, token });
  } catch (error) {
    const [race] = await db
      .select()
      .from(players)
      .where(and(eq(players.examId, exam.id), sql`lower(trim(${players.name})) = lower(${name})`))
      .limit(1);
    if (race) return Response.json({ token: race.token, name: race.name });
    throw error;
  }

  return Response.json({ token, name });
}
