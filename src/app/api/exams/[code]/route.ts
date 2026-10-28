import { buildState, getExamByCode, syncStatus } from "@/lib/exam";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const token = req.headers.get("x-player-token");
  const exam = await getExamByCode(code);
  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  const synced = await syncStatus(exam);
  return Response.json(await buildState(synced, token));
}
