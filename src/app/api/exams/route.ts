import { db } from "@/db";
import { exams, players, questions } from "@/db/schema";
import { demoQuestions } from "@/lib/demoBank";
import { generateCode, newToken, normalizePlayerName } from "@/lib/exam";
import { generateWithOpenRouter, type UploadedFile } from "@/lib/gemini";
import type { GeneratedQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }
  const hostName = normalizePlayerName(String(form.get("hostName") ?? ""));
  const title = String(form.get("title") ?? "").trim().slice(0, 80) || "Weekend Exam";
  const questionCount = [20, 25].includes(Number(form.get("questionCount")))
    ? Number(form.get("questionCount"))
    : 20;
  const durationMin = [10, 15, 20].includes(Number(form.get("durationMin")))
    ? Number(form.get("durationMin"))
    : 15;
  const negRaw = Number(form.get("negativeMark"));
  const negativeMark = [0, 0.25, 0.5].includes(negRaw) ? negRaw : 0;
  const useDemo = form.get("demo") === "1";

  if (!hostName) return Response.json({ error: "Enter your name first" }, { status: 400 });

  const files: UploadedFile[] = [];
  let total = 0;
  for (const entry of form.getAll("files")) {
    if (typeof entry === "string") continue;
    const f = entry as File;
    const mimeType = f.type || "application/octet-stream";
    if (!(mimeType === "application/pdf" || mimeType.startsWith("image/"))) continue;
    const buf = Buffer.from(await f.arrayBuffer());
    total += buf.length;
    files.push({ mimeType, base64: buf.toString("base64"), name: f.name });
  }
  if (total > MAX_BYTES) {
    return Response.json({ error: "Upload too large (max 3 MB total for this deployment). Compress or split the PDF/images." }, { status: 413 });
  }
  if (!useDemo && files.length === 0) {
    return Response.json({ error: "Upload at least one PDF or image (or use Demo mode)." }, { status: 400 });
  }

  let qs: GeneratedQuestion[] = [];
  let source = "openrouter";
  let warning: string | null = null;
  if (useDemo) {
    qs = demoQuestions(questionCount);
    source = "demo";
  } else {
    try {
      qs = await generateWithOpenRouter(files, questionCount);
      if (qs.length === 0) throw new Error("OpenRouter returned no usable questions");
      if (qs.length < questionCount) warning = `OpenRouter produced ${qs.length} valid questions from your pages.`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warning =
        msg === "NO_OPENROUTER_KEY"
          ? "OPENROUTER_API_KEY is not configured on the server — using the built-in demo question bank."
          : `OpenRouter failed (${msg.slice(0, 160)}) — using the built-in demo question bank.`;
      qs = demoQuestions(questionCount);
      source = "demo";
    }
  }

  const code = await generateCode();
  const token = newToken();
  try {
    await db.transaction(async (tx) => {
      const [exam] = await tx
        .insert(exams)
        .values({
          code,
          title,
          questionCount: qs.length,
          durationMin,
          negativeMark,
          source,
          hostName,
        })
        .returning();

      await tx.insert(questions).values(
        qs.map((q, i) => ({
          examId: exam.id,
          idx: i + 1,
          subject: q.subject,
          subTopic: q.subTopic,
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })),
      );
      await tx.insert(players).values({ examId: exam.id, name: hostName, token });
    });
  } catch (error) {
    console.error("Failed to create exam transaction", error);
    return Response.json({ error: "Could not save the exam. Please retry." }, { status: 500 });
  }

  return Response.json({ code, token, name: hostName, warning, source });
}
