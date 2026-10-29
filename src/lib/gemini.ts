import { SUBJECTS, type GeneratedQuestion, type Subject } from "./types";

export type UploadedFile = { mimeType: string; base64: string; name: string };

const PROMPT = (count: number) => `You are an expert Bangladeshi competitive-exam (BCS / Bank / Admission) MCQ setter.
The attached pages are photos/PDF pages from a student's Bangla, English, Math and General Knowledge (GK) books studied this week.

Create exactly ${count} high-quality multiple-choice questions STRICTLY based on the content of these pages.
- If the pages contain MCQs, extract them; otherwise create new MCQs from the content.
- Balance questions across the subjects that appear in the pages (Bangla, English, Math, GK).
- Each question has exactly 4 options and exactly one correct option.
- Write Bangla & GK questions in Bangla; English questions in English; Math may be Bangla or English as on the page.
- subject must be one of: Bangla, English, Math, GK.
- subTopic must be a specific syllabus sub-topic, e.g. Bangla: সন্ধি, সমাস, বানান শুদ্ধিকরণ, কারক ও বিভক্তি, বাগধারা, সাহিত্য; English: Preposition, Right Form of Verbs, Synonym, Antonym, Narration, Voice; Math: শতকরা, লাভ-ক্ষতি, সুদকষা, ঐকিক নিয়ম, অনুপাত, বীজগণিত; GK: মুক্তিযুদ্ধ, বাংলাদেশ বিষয়াবলী, আন্তর্জাতিক বিষয়াবলী, ভূগোল, বিজ্ঞান.
- correctIndex is 0-based (0=ক/A, 1=খ/B, 2=গ/C, 3=ঘ/D).
- explanation must teach "why it is correct": for Math give step-by-step working plus a shortcut formula; for grammar give the exact rule; for GK give historical/factual context and book reference. Keep it 2-5 sentences.
- Shuffle the position of the correct answer across questions.
Return ONLY JSON matching the schema.`;

function normalizeSubject(s: string): Subject {
  const v = (s || "").toLowerCase();
  if (v.includes("bang") || v.includes("বাংলা")) return "Bangla";
  if (v.includes("eng") || v.includes("ইংরে")) return "English";
  if (v.includes("math") || v.includes("গণিত")) return "Math";
  return "GK";
}

export function sanitizeQuestions(raw: unknown): GeneratedQuestion[] {
  const arr = (raw as { questions?: unknown[] })?.questions;
  if (!Array.isArray(arr)) return [];
  const out: GeneratedQuestion[] = [];
  for (const q of arr) {
    const o = q as Record<string, unknown>;
    const options = Array.isArray(o.options) ? o.options.map((x) => String(x).trim()).slice(0, 4) : [];
    const question = String(o.question ?? "").trim();
    const ci = Number(o.correctIndex);
    if (!question || options.length !== 4 || options.some((option) => !option) || !Number.isInteger(ci) || ci < 0 || ci > 3) continue;
    out.push({
      subject: normalizeSubject(String(o.subject ?? "")),
      subTopic: String(o.subTopic ?? "General").trim() || "General",
      question,
      options,
      correctIndex: ci,
      explanation: String(o.explanation ?? "").trim() || "ব্যাখ্যা পাওয়া যায়নি।",
    });
  }
  return out;
}

export async function generateWithOpenRouter(
  files: UploadedFile[],
  count: number,
  excludedQuestions: string[] = [],
): Promise<GeneratedQuestion[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("NO_OPENROUTER_KEY");

  const model = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free";
  const contentParts: Array<Record<string, unknown>> = [
    { type: "text", text: [
      PROMPT(count),
      excludedQuestions.length
        ? "This is a retry to fill missing questions. Do not repeat or paraphrase any of these existing questions. Create genuinely different questions based on the uploaded pages:\n" + excludedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
        : "",
    ].filter(Boolean).join("\n\n") },
  ];

  for (const file of files) {
    if (file.mimeType === "application/pdf") {
      contentParts.push({
        type: "file",
        file: {
          filename: file.name || "study-pages.pdf",
          file_data: `data:application/pdf;base64,${file.base64}`,
        },
      });
    } else if (file.mimeType.startsWith("image/")) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${file.mimeType};base64,${file.base64}`,
        },
      });
    }
  }

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-Title": "Blind Exam Room",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: contentParts,
          },
        ],
        response_format: { type: "json_object" },
        // This model enables reasoning by default; disabling it reduces latency for structured MCQ generation.
        reasoning: { enabled: false },
        max_tokens: 8000,
      }),
      signal: AbortSignal.timeout(105000),
    });
  } catch (error) {
    const detail = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      ? "timed out after 105 seconds (the free model may be overloaded or generating too much output)"
      : error instanceof Error ? error.message : String(error);
    throw new Error(`OpenRouter request ${detail}`);
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`OpenRouter model ${model} returned HTTP ${res.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await res.json();
  const messageContent = data?.choices?.[0]?.message?.content;
  const text = typeof messageContent === "string"
    ? messageContent
    : Array.isArray(messageContent)
      ? messageContent.map((part: { text?: string }) => part?.text ?? "").join("")
      : "";
  if (!text.trim()) throw new Error("OpenRouter returned an empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OpenRouter did not return valid JSON");
    parsed = JSON.parse(match[0]);
  }

  const normalized = (value: string) =>
    value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const uniqueQuestions = (items: GeneratedQuestion[]) => {
    const seen = new Set<string>();
    return items.filter((q) => {
      const key = normalized(q.question);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const questions = uniqueQuestions(sanitizeQuestions(parsed)).slice(0, count);
  if (questions.length === 0) throw new Error("OpenRouter returned no usable questions");

  // If validation removed some generated items, make one targeted follow-up request
  // for the missing questions, explicitly excluding questions already accepted.
  if (questions.length < count && excludedQuestions.length === 0) {
    const missing = count - questions.length;
    const retryCount = Math.min(count, missing + 2);
    try {
      const extra = await generateWithOpenRouter(
        files,
        retryCount,
        questions.map((q) => q.question),
      );
      return uniqueQuestions([...questions, ...extra]).slice(0, count);
    } catch (error) {
      // Keep the valid questions from the first response if the targeted retry fails.
      console.error("OpenRouter missing-question retry failed", error);
    }
  }

  return questions;
}
