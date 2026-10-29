import { SUBJECTS, type GeneratedQuestion, type Subject } from "./types";

export type UploadedFile = { mimeType: string; base64: string; name: string };

const PROMPT = (count: number) => `You are an expert Bangladeshi competitive-exam (BCS / Bank / Admission) MCQ setter and careful Bengali proofreader.
The attached file(s) are the user's source material. They may contain only one subject, including a mathematics-only PDF.

First identify which subject(s) actually appear in the uploaded material. Create exactly ${count} high-quality multiple-choice questions STRICTLY based on that material.
- Never balance across subjects that are not present in the uploaded material. If the PDF contains only mathematics, ALL questions must be mathematics. Do not add Bangla grammar, English, GK, or general knowledge questions just to diversify the exam.
- If the pages contain MCQs, extract them accurately; otherwise create new MCQs only from concepts, examples, and facts clearly supported by the pages. Do not use a generic question bank.
- If the source does not contain enough distinct material for ${count} reliable questions, return only the number of high-quality questions it supports rather than inventing unrelated questions.
- Each question must have exactly 4 short, clearly distinguishable options and exactly one correct option.
- Write questions in natural, correct Bangla when the source is Bangla; use correct English when the source is English. For mathematics, preserve the source's level and terminology.
- Proofread every question and option for both spelling AND meaning. Check that the full sentence makes sense for the subject and that the question actually asks a solvable, unambiguous thing.
- For mathematics, verify the mathematical relationship before returning the question. For example, consecutive integers' squares differ by a difference of squares; a phrase such as "দুইটি ক্রমিক সংখ্যার বর্ণের অন্তর" is semantically invalid in a math problem and must not be emitted. If the intended source term cannot be confidently read, use a different clearly supported problem rather than guessing.
- Never silently replace an unclear OCR word with a plausible-looking word unless context makes the correction unambiguous. Do not substitute similar-looking Bengali words such as "বর্গ" and "বর্ণ".
- Use readable, standard mathematical notation. Avoid corrupted symbols, broken fractions, raw LaTeX, escaped Unicode, or fragments such as "undefined" or "NaN". Write expressions plainly, e.g. "9² − 8²" or "x + 2 = 5".
- Do not output Markdown formatting such as **bold**, __underline__, backticks, or dollar-sign LaTeX delimiters in question or option text.
- Use readable, standard mathematical notation. Avoid corrupted symbols, broken fractions, raw LaTeX, escaped Unicode, or fragments such as "undefined" or "NaN". Write expressions plainly, e.g. "9² − 8²" or "x + 2 = 5".
- Do NOT include Markdown formatting such as **bold**, __underline__, backticks, bullet markers, or decorative quotation marks in question, option, subTopic, or explanation text.
- Do NOT put option labels (ক/খ/গ/ঘ or A/B/C/D) inside option strings; the app displays the labels separately.
- Every option must be complete, readable, and belong to the same kind of answer (all numbers, all words, etc. where appropriate). Avoid near-duplicate or ambiguous options.
- subject must be one of: Bangla, English, Math, GK.
- subTopic must be a specific syllabus sub-topic, e.g. Bangla: সন্ধি, সমাস, বানান শুদ্ধিকরণ, কারক ও বিভক্তি, বাগধারা, সাহিত্য; English: Preposition, Right Form of Verbs, Synonym, Antonym, Narration, Voice; Math: শতকরা, লাভ-ক্ষতি, সুদকষা, ঐকিক নিয়ম, অনুপাত, বীজগণিত; GK: মুক্তিযুদ্ধ, বাংলাদেশ বিষয়াবলী, আন্তর্জাতিক বিষয়াবলী, ভূগোল, বিজ্ঞান.
- correctIndex is 0-based (0=ক/A, 1=খ/B, 2=গ/C, 3=ঘ/D).
- explanation must teach why the answer is correct: for Math give correct step-by-step working plus a shortcut formula; for grammar give the exact rule; for GK give factual context only when supported. Keep it 2-5 concise sentences.
- Shuffle the position of the correct answer across questions.
Return ONLY valid JSON matching the schema.`;

function normalizeSubject(s: string, question = "", subTopic = ""): Subject {
  const v = (s || "").toLowerCase();
  const context = `${question} ${subTopic}`.toLowerCase();

  if (v.includes("bang") || v.includes("বাংলা")) return "Bangla";
  if (v.includes("eng") || v.includes("ইংরে")) return "English";
  if (v.includes("math") || v.includes("গণিত")) return "Math";

  // Some models return the Bangla display label "সাধারণ জ্ঞান" even for math MCQs.
  // Infer Math from the question/topic when the supplied subject label is generic or incorrect.
  const mathSignals = [
    "সংখ্যা", "অঙ্ক", "বর্গ", "বর্গমূল", "মূলদ", "অমূলদ", "ভগ্নাংশ",
    "গুণনীয়ক", "গুণিতক", "মৌলিক", "ক্রমিক", "সমষ্টি", "অন্তর",
    "সমীকরণ", "শতকরা", "অনুপাত", "লব", "হর", "বাস্তব সংখ্যা",
    "√", "∛", "=", "×", "÷", "²", "³", "fraction", "prime number",
  ];
  if (mathSignals.some((term) => context.includes(term))) return "Math";
  return "GK";
}

function cleanText(value: unknown): string {
  const superscript: Record<string, string> = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
    "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
    "n": "ⁿ", "i": "ⁱ", "p": "ᵖ",
  };
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\*\*|__|\x60/g, "")
    .replace(/\\[()[\]]/g, "")
    .replace(/\\(?:cdot|times)/g, " × ")
    .replace(/\\minus/g, " − ")
    .replace(/\^\{([^}]+)\}/g, (_, exponent: string) =>
      [...exponent].map((char) => superscript[char] ?? char).join(""),
    )
    .replace(/\^([0-9np])/g, (_, exponent: string) => superscript[exponent] ?? exponent)
    .replace(/\\(?:left|right)/g, "")
    .replace(/\$/g, "")
    .replace(/\\(?:text|mathrm)\{([^}]+)\}/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function sanitizeQuestions(raw: unknown): GeneratedQuestion[] {
  const arr = (raw as { questions?: unknown[] })?.questions;
  if (!Array.isArray(arr)) return [];
  const out: GeneratedQuestion[] = [];
  for (const q of arr) {
    if (!q || typeof q !== "object") continue;
    const o = q as Record<string, unknown>;
    const options = Array.isArray(o.options) ? o.options.map((value) => cleanText(value).replace(/^(?:[কখগঘ]|[A-D])(?=\s|[.)ঃ:])/i, "").trim()).slice(0, 4) : [];
    const question = cleanText(o.question);
    const subTopic = cleanText(o.subTopic) || "General";
    const ci = Number(o.correctIndex);
    if (!question || options.length !== 4 || options.some((option) => !option) || new Set(options.map((x) => x.toLocaleLowerCase())).size !== 4 || !Number.isInteger(ci) || ci < 0 || ci > 3) continue;

    // Reject obvious Bengali OCR/word-substitution errors in common math phrasing.
    const lowerQuestion = question.toLowerCase();
    const looksMathematical = normalizeSubject(String(o.subject ?? ""), question, subTopic) === "Math";
    const corruptedMathPhrase =
      looksMathematical &&
      (lowerQuestion.includes("বর্ণের অন্তর") ||
       lowerQuestion.includes("বর্ণের সমষ্টি") ||
       lowerQuestion.includes("অস্তরফল") ||
       lowerQuestion.includes("betegুণ"));
    if (corruptedMathPhrase) continue;

    out.push({
      subject: normalizeSubject(String(o.subject ?? ""), question, subTopic),
      subTopic,
      question,
      options,
      correctIndex: ci,
      explanation: cleanText(o.explanation) || "ব্যাখ্যা পাওয়া যায়নি।",
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
