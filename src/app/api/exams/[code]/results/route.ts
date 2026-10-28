import { buildResults, getExamByCode, syncStatus } from "@/lib/exam";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const exam = await getExamByCode(code);
  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  const synced = await syncStatus(exam);
  // Answers & explanations stay locked until the exam is over.
  if (synced.status !== "finished") {
    return Response.json({ error: "Results are locked until the exam ends." }, { status: 403 });
  }
  return Response.json(await buildResults(synced));
}
