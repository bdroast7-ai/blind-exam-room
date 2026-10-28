"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ExamResults, PlayerResult } from "@/lib/types";
import { SUBJECTS } from "@/lib/types";
import { accColor, optionLetter, subjectStyle } from "@/lib/ui";

type Filter = "all" | "wrong" | "skipped" | "correct" | `subj:${string}`;

const medals = ["🥇", "🥈", "🥉"];

export default function Results({ code, meName }: { code: string; meName: string | null }) {
  const [data, setData] = useState<ExamResults | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showFriends, setShowFriends] = useState(true);

  useEffect(() => {
    fetch(`/api/exams/${code}/results`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed");
        const res = d as ExamResults;
        setData(res);
        const me = res.players.find((p) => p.name.toLowerCase() === meName?.toLowerCase());
        setViewer(me?.id ?? res.players[0]?.id ?? null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [code, meName]);

  const viewerP = data?.players.find((p) => p.id === viewer) ?? null;

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.questions.filter((q) => {
      const a = viewerP?.answers[String(q.id)];
      if (filter === "all") return true;
      if (filter === "wrong") return a !== undefined && a !== q.correctIndex;
      if (filter === "skipped") return a === undefined;
      if (filter === "correct") return a === q.correctIndex;
      return q.subject === filter.slice(5);
    });
  }, [data, filter, viewerP]);

  if (err) return <p className="mt-16 text-center text-red-600">{err}</p>;
  if (!data) return <p className="mt-16 text-center text-slate-500">Unlocking answers &amp; explanations…</p>;

  const subjectsInExam = SUBJECTS.filter((s) => data.questions.some((q) => q.subject === s));
  const neg = data.negativeMark;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Results unlocked · Room {data.code}</p>
          <h1 className="text-2xl font-extrabold">{data.title}</h1>
          <p className="text-sm text-slate-500">
            {data.questionCount} questions · +1 correct · {neg ? `-${neg} wrong` : "no negative marking"} · 0 skipped
            {data.source === "demo" && " · demo question bank"}
          </p>
        </div>
        <Link href="/" className="btn-ghost">
          New exam
        </Link>
      </div>

      {/* Scoreboard */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.players.map((p) => (
          <button
            key={p.id}
            onClick={() => setViewer(p.id)}
            className={`card p-4 text-left transition ${viewer === p.id ? "ring-2 ring-indigo-500" : "hover:ring-1 hover:ring-slate-300"}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{medals[p.rank - 1] ?? `#${p.rank}`}</span>
              {p.name.toLowerCase() === meName?.toLowerCase() && <span className="rounded-full bg-indigo-50 px-2 text-xs text-indigo-700">you</span>}
            </div>
            <p className="mt-1 truncate font-bold">{p.name}</p>
            <p className="text-3xl font-extrabold tabular-nums">
              {p.score}
              <span className="text-base font-medium text-slate-400"> / {data.questionCount}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              <span className="text-emerald-600">✓ {p.correct}</span> · <span className="text-red-600">✗ {p.wrong}</span> ·{" "}
              <span className="text-slate-400">– {p.skipped}</span>
            </p>
          </button>
        ))}
      </section>

      {/* Weakness diagnosis */}
      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold">Weakness Diagnosis Table</h2>
          <p className="text-xs text-slate-500">Any subject below 50% accuracy (this exam or the last 3 exams combined) is flagged in red.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Friend</th>
                <th className="px-4 py-2.5">Score</th>
                {subjectsInExam.map((s) => (
                  <th key={s} className="px-4 py-2.5">
                    {subjectStyle(s).label}
                  </th>
                ))}
                <th className="px-4 py-2.5">Auto-detected weak point</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.players.map((p) => (
                <DiagRow key={p.id} p={p} subjects={subjectsInExam} total={data.questionCount} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {viewerP && <TopicBreakdown p={viewerP} />}

      {/* Review */}
      <section className="mt-8">
        <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-2 font-bold">Solution Sheet</h2>
            <select className="input w-auto py-1.5" value={viewer ?? ""} onChange={(e) => setViewer(Number(e.target.value))}>
              {data.players.map((p) => (
                <option key={p.id} value={p.id}>
                  Viewing as: {p.name}
                </option>
              ))}
            </select>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={showFriends} onChange={(e) => setShowFriends(e.target.checked)} /> Friends&apos; picks
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                ["all", "Show all"],
                ["wrong", "Only my wrong"],
                ["skipped", "Skipped"],
                ["correct", "Correct"],
                ...subjectsInExam.map((s) => [`subj:${s}`, `${subjectStyle(s).label} only`]),
              ] as [Filter, string][]
            ).map(([f, l]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  filter === f ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {filtered.length === 0 && <p className="py-10 text-center text-slate-500">No questions match this filter 🎉</p>}
          {filtered.map((q) => {
            const st = subjectStyle(q.subject);
            const mine = viewerP?.answers[String(q.id)];
            const status = mine === undefined ? "skipped" : mine === q.correctIndex ? "correct" : "wrong";
            const marks = status === "correct" ? "+1.0" : status === "wrong" ? (neg ? `-${neg}` : "0") : "0";
            const border = status === "correct" ? "border-l-emerald-500" : status === "wrong" ? "border-l-red-500" : "border-l-slate-300";
            return (
              <article key={q.id} className={`card border-l-4 p-5 ${border}`}>
                <header className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-slate-400">Q{q.idx}</span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${st.chip}`}>
                    {q.subject} • {q.subTopic}
                  </span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 font-bold ${
                      status === "correct" ? "bg-emerald-100 text-emerald-700" : status === "wrong" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {status === "skipped" ? "Skipped" : status === "correct" ? "Correct" : "Wrong"} · Marks: {marks}
                  </span>
                </header>
                <p className="whitespace-pre-line font-medium leading-relaxed">{q.question}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {q.options.map((o, i) => {
                    const isCorrect = i === q.correctIndex;
                    const isMine = i === mine;
                    const pickers = data.players.filter((p) => p.answers[String(q.id)] === i);
                    const cls = isCorrect
                      ? "border-emerald-500 bg-emerald-50"
                      : isMine
                        ? "border-red-500 bg-red-50"
                        : "border-slate-200 bg-white";
                    return (
                      <div key={i} className={`rounded-xl border px-3 py-2.5 text-sm ${cls}`}>
                        <div className="flex items-start gap-3">
                          <span
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                              isCorrect ? "bg-emerald-600 text-white" : isMine ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {optionLetter(q.subject, i)}
                          </span>
                          <span className="flex-1 pt-0.5">{o}</span>
                          {isCorrect && <span className="text-emerald-600">✓</span>}
                          {isMine && !isCorrect && <span className="text-red-600">✗</span>}
                        </div>
                        {showFriends && pickers.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1 pl-9">
                            {pickers.map((p) => (
                              <span
                                key={p.id}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  p.id === viewer ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {p.id === viewer ? "You" : p.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-relaxed">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-indigo-700">💡 Why it&apos;s correct</p>
                  <p>
                    <b>
                      সঠিক উত্তর: {optionLetter(q.subject, q.correctIndex)}) {q.options[q.correctIndex]}
                    </b>
                    {mine !== undefined && mine !== q.correctIndex && (
                      <span className="text-red-700">
                        {" "}
                        · তোমার উত্তর: {optionLetter(q.subject, mine)}) {q.options[mine]}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-slate-700">ব্যাখ্যা: {q.explanation}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function DiagRow({ p, subjects, total }: { p: PlayerResult; subjects: string[]; total: number }) {
  const histFlag = p.history.subjects.filter((s) => s.flagged && p.history.exams > 1);
  return (
    <tr className="align-top">
      <td className="px-4 py-3 font-semibold">
        <Link href={`/profile/${encodeURIComponent(p.name)}`} className="hover:text-indigo-600 hover:underline">
          {p.name}
        </Link>
      </td>
      <td className="px-4 py-3 tabular-nums">
        {p.score} / {total}
      </td>
      {subjects.map((s) => {
        const st = p.subjects.find((x) => x.subject === s);
        if (!st) return <td key={s} className="px-4 py-3 text-slate-300">—</td>;
        return (
          <td key={s} className="px-4 py-3">
            <span className={`inline-block rounded-lg px-2 py-1 text-xs font-semibold ${accColor(st.accuracy)}`}>
              {st.accuracy}% <span className="font-normal">({st.label})</span>
            </span>
            <div className="mt-0.5 text-[10px] text-slate-400">
              {st.correct}/{st.total}
            </div>
          </td>
        );
      })}
      <td className="px-4 py-3">
        {p.weakSubjects.length === 0 ? (
          <span className="text-xs text-emerald-700">No subject below 50% — keep revising 💪</span>
        ) : (
          <ul className="space-y-1">
            {p.weakSubjects.map((w) => (
              <li key={w.subject} className="text-xs">
                <span className="font-bold text-red-600">{w.subject}</span>
                {w.topics.length > 0 && <span className="text-slate-600"> (Specifically: {w.topics.join(" & ")})</span>}
              </li>
            ))}
          </ul>
        )}
        {histFlag.length > 0 && (
          <p className="mt-1.5 text-[11px] text-red-500">
            Last {p.history.exams} exams: {histFlag.map((h) => `${h.subject} ${h.accuracy}%`).join(", ")}
          </p>
        )}
      </td>
    </tr>
  );
}

function TopicBreakdown({ p }: { p: PlayerResult }) {
  const topics = [...p.topics].sort((a, b) => a.accuracy - b.accuracy);
  return (
    <section className="card mt-6 p-5">
      <h2 className="font-bold">
        Sub-topic breakdown — <span className="text-indigo-600">{p.name}</span>
      </h2>
      <p className="text-xs text-slate-500">Weakest first. Red = revise next week.</p>
      <div className="mt-4 grid gap-x-8 gap-y-2.5 md:grid-cols-2">
        {topics.map((t) => (
          <div key={t.subject + t.subTopic}>
            <div className="flex justify-between text-xs">
              <span>
                <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${subjectStyle(t.subject).dot}`} />
                {t.subTopic} <span className="text-slate-400">· {t.subject}</span>
              </span>
              <span className="font-semibold tabular-nums">
                {t.correct}/{t.total} · {t.accuracy}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full ${t.accuracy < 50 ? "bg-red-500" : t.accuracy < 80 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.max(t.accuracy, 3)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
