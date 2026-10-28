export const SUBJECT_STYLE: Record<string, { chip: string; dot: string; label: string }> = {
  Bangla: { chip: "bg-rose-100 text-rose-800 ring-rose-200", dot: "bg-rose-500", label: "বাংলা" },
  English: { chip: "bg-sky-100 text-sky-800 ring-sky-200", dot: "bg-sky-500", label: "English" },
  Math: { chip: "bg-amber-100 text-amber-800 ring-amber-200", dot: "bg-amber-500", label: "গণিত" },
  GK: { chip: "bg-emerald-100 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500", label: "সাধারণ জ্ঞান" },
};

export function subjectStyle(s: string) {
  return SUBJECT_STYLE[s] ?? { chip: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400", label: s };
}

export function optionLetter(subject: string, i: number) {
  return subject === "English" ? "ABCD"[i] : ["ক", "খ", "গ", "ঘ"][i];
}

export function accColor(acc: number) {
  if (acc >= 80) return "text-emerald-700 bg-emerald-50";
  if (acc >= 60) return "text-lime-700 bg-lime-50";
  if (acc >= 50) return "text-amber-700 bg-amber-50";
  if (acc >= 30) return "text-orange-700 bg-orange-50";
  return "text-red-700 bg-red-50";
}

export function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export type Session = { token: string; name: string };
export function loadSession(code: string): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`wme:${code}`);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(code: string, s: Session) {
  localStorage.setItem(`wme:${code}`, JSON.stringify(s));
  localStorage.setItem("wme:lastName", s.name);
}
