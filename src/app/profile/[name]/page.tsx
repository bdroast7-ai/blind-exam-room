import Link from "next/link";
import { db } from "@/db";
import { exams, players, questions } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { SUBJECTS } from "@/lib/types";
import { accColor, subjectStyle } from "@/lib/ui";
import { accuracyLabel } from "@/lib/exam";

export const dynamic = "force-dynamic";

export default async function Profile({ params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name);
  const rows = await db
    .select({ examId: exams.id, code: exams.code, title: exams.title, endsAt: exams.endsAt, neg: exams.negativeMark, answers: players.answers })
    .from(players)
    .innerJoin(exams, eq(players.examId, exams.id))
    .where(and(eq(exams.status, "finished"), sql`lower(trim(${players.name})) = lower(trim(${name}))`))
    .orderBy(desc(exams.endsAt));

  const qs = rows.length
    ? await db.select().from(questions).where(inArray(questions.examId, rows.map((r) => r.examId)))
    : [];

  const perExam = rows.map((r, i) => {
    const eqs = qs.filter((q) => q.examId === r.examId);
    const subj: Record<string, { c: number; t: number }> = {};
    let c = 0,
      w = 0;
    for (const q of eqs) {
      const a = (r.answers ?? {})[String(q.id)];
      subj[q.subject] ??= { c: 0, t: 0 };
      subj[q.subject].t++;
      if (a === q.correctIndex) {
        subj[q.subject].c++;
        c++;
      } else if (a !== undefined) w++;
    }
    return { ...r, idx: i, total: eqs.length, score: Math.round((c - w * r.neg) * 100) / 100, subj };
  });

  const combine = (list: typeof perExam) => {
    const agg: Record<string, { c: number; t: number }> = {};
    list.forEach((e) =>
      Object.entries(e.subj).forEach(([s, v]) => {
        agg[s] ??= { c: 0, t: 0 };
        agg[s].c += v.c;
        agg[s].t += v.t;
      }),
    );
    return agg;
  };
  const last3 = combine(perExam.slice(0, 3));
  const lifetime = combine(perExam);

  // lifetime sub-topic accuracy
  const topicAgg: Record<string, { subject: string; topic: string; c: number; t: number }> = {};
  for (const r of rows) {
    for (const q of qs.filter((x) => x.examId === r.examId)) {
      const k = q.subject + "|" + q.subTopic;
      topicAgg[k] ??= { subject: q.subject, topic: q.subTopic, c: 0, t: 0 };
      topicAgg[k].t++;
      if ((r.answers ?? {})[String(q.id)] === q.correctIndex) topicAgg[k].c++;
    }
  }
  const weakTopics = Object.values(topicAgg)
    .map((t) => ({ ...t, acc: Math.round((t.c / t.t) * 100) }))
    .filter((t) => t.acc < 50)
    .sort((a, b) => a.acc - b.acc || b.t - a.t)
    .slice(0, 12);

  const pct = (v?: { c: number; t: number }) => (v && v.t ? Math.round((v.c / v.t) * 100) : null);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/" className="text-sm text-indigo-600 hover:underline">
        ← Lobby
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold">{name}</h1>
      <p className="text-sm text-slate-500">{rows.length} finished exam(s)</p>

      {rows.length === 0 ? (
        <p className="card mt-6 p-6 text-slate-500">No finished exams yet for this name.</p>
      ) : (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SUBJECTS.map((s) => {
              const a3 = pct(last3[s]);
              const lt = pct(lifetime[s]);
              const flagged = a3 !== null && a3 < 50;
              return (
                <div key={s} className={`card p-4 ${flagged ? "border-red-300 ring-2 ring-red-200" : ""}`}>
                  <p className="text-sm font-semibold">{subjectStyle(s).label}</p>
                  <p className={`mt-1 text-3xl font-extrabold ${flagged ? "text-red-600" : ""}`}>{a3 === null ? "—" : `${a3}%`}</p>
                  <p className="text-xs text-slate-500">
                    Last 3 exams{a3 !== null && ` · ${accuracyLabel(a3)}`} · lifetime {lt === null ? "—" : `${lt}%`}
                  </p>
                  {flagged && <p className="mt-2 text-xs font-bold text-red-600">⚑ Flagged for revision</p>}
                </div>
              );
            })}
          </section>

          <section className="card mt-6 p-5">
            <h2 className="font-bold">Revision list — weakest sub-topics (lifetime)</h2>
            {weakTopics.length === 0 ? (
              <p className="mt-2 text-sm text-emerald-700">No sub-topic below 50%. Great work!</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {weakTopics.map((t) => (
                  <span key={t.subject + t.topic} className="rounded-lg bg-red-50 px-2.5 py-1 text-sm text-red-700">
                    {t.topic} <span className="text-xs text-red-400">· {t.subject} · {t.c}/{t.t}</span>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="card mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Exam</th>
                  <th className="px-4 py-2.5">Score</th>
                  {SUBJECTS.map((s) => (
                    <th key={s} className="px-4 py-2.5">
                      {s}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perExam.map((e) => (
                  <tr key={e.examId}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.title}</p>
                      <p className="text-xs text-slate-400">{e.endsAt?.toLocaleDateString("en-GB")}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {e.score}/{e.total}
                    </td>
                    {SUBJECTS.map((s) => {
                      const a = pct(e.subj[s]);
                      return (
                        <td key={s} className="px-4 py-3">
                          {a === null ? <span className="text-slate-300">—</span> : <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${accColor(a)}`}>{a}%</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right">
                      <Link href={`/exam/${e.code}`} className="text-xs text-indigo-600 hover:underline">
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
