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

const responseSchema = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          subject: { type: "STRING", enum: [...SUBJECTS] },
          subTopic: { type: "STRING" },
          question: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          correctIndex: { type: "INTEGER" },
          explanation: { type: "STRING" },
        },
        required: ["subject", "subTopic", "question", "options", "correctIndex", "explanation"],
      },
    },
  },
  required: ["questions"],
};

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
    const options = Array.isArray(o.options) ? o.options.map((x) => String(x)).slice(0, 4) : [];
    const ci = Number(o.correctIndex);
    if (!o.question || options.length !== 4 || !(ci >= 0 && ci <= 3)) continue;
    out.push({
      subject: normalizeSubject(String(o.subject ?? "")),
      subTopic: String(o.subTopic ?? "General").trim() || "General",
      question: String(o.question).trim(),
      options,
      correctIndex: ci,
      explanation: String(o.explanation ?? "").trim() || "ব্যাখ্যা পাওয়া যায়নি।",
    });
  }
  return out;
}

export async function generateWithGemini(
  files: UploadedFile[],
  count: number,
): Promise<GeneratedQuestion[]> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("NO_KEY");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT(count) },
          ...files.map((f) => ({ inline_data: { mime_type: f.mimeType, data: f.base64 } })),
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.4,
    },
  };

  // Retry up to 3 times for temporary 503 / high demand errors
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      },
    );

    if (res.ok || res.status !== 503) break;
    // Wait 2 seconds before retrying on a 503
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!res || !res.ok) {
    const t = await res?.text() || "";
    throw new Error(`Gemini API error ${res?.status}: ${t.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : {};
  }
  return sanitizeQuestions(parsed).slice(0, count);
}
