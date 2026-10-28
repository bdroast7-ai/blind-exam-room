import Link from "next/link";
import { db } from "@/db";
import { exams, players } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import Lobby from "@/components/Lobby";

export const dynamic = "force-dynamic";

export default async function Home() {
  const recent = await db.select().from(exams).where(eq(exams.status, "finished")).orderBy(desc(exams.endsAt)).limit(8);
  const ps = recent.length ? await db.select({ examId: players.examId, name: players.name }).from(players).where(inArray(players.examId, recent.map((r) => r.id))) : [];
  const names = [...new Set(ps.map((p) => p.name.trim()))];

  return (
    <main className="home-shell mx-auto max-w-6xl px-4 pb-12 pt-8 sm:pt-10">
      <section className="home-intro mb-7">
        <div className="eyebrow"><span className="eyebrow-dot" /> YOUR STUDY ROOM, READY WHEN YOU ARE</div>
        <div className="intro-grid">
          <div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Turn your notes into a <span className="text-indigo-600">real challenge.</span></h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Upload your study pages, build a private MCQ exam, and compete with friends. Answers stay hidden until the exam ends.</p>
          </div>
          <div className="intro-note"><span className="note-icon">✦</span><div><strong>Study smarter, together.</strong><p>Practice · compete · review · improve</p></div></div>
        </div>
        <ol className="workflow mt-6">
          {["Upload your pages", "Generate questions", "Invite your friends", "Review your results"].map((s, i) => (
            <li key={s}><span>{String(i + 1).padStart(2, "0")}</span>{s}</li>
          ))}
        </ol>
      </section>

      <Lobby />

      {recent.length > 0 && (
        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          <div className="card history-card p-5 sm:p-6 lg:col-span-2">
            <div className="section-heading"><div><p className="section-kicker">KEEP YOUR MOMENTUM</p><h2 className="mt-1 text-lg font-bold">Recent exams</h2></div><span className="section-count">{recent.length} saved</span></div>
            <ul className="mt-4 divide-y divide-slate-100">
              {recent.map((e) => (
                <li key={e.id} className="history-row flex items-center justify-between gap-4 py-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-semibold text-slate-800">{e.title}</p><p className="mt-1 text-xs text-slate-500">{e.endsAt?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {e.questionCount} questions · {ps.filter((p) => p.examId === e.id).map((p) => p.name).join(", ")}</p></div>
                  <Link href={`/exam/${e.code}`} className="shrink-0 text-sm font-semibold text-indigo-600 hover:text-indigo-800">Review <span aria-hidden="true">↗</span></Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="card history-card p-5 sm:p-6">
            <p className="section-kicker">YOUR LEARNING PROFILE</p><h2 className="mt-1 text-lg font-bold">Weak-point profiles</h2>
            <p className="mt-2 text-sm leading-5 text-slate-500">See which topics need more practice.</p>
            {names.length ? <div className="mt-4 flex flex-wrap gap-2">{names.map((n) => <Link key={n} href={`/profile/${encodeURIComponent(n)}`} className="profile-chip">{n}<span aria-hidden="true">↗</span></Link>)}</div> : <p className="mt-4 text-sm text-slate-500">Profiles appear after exams are completed.</p>}
          </div>
        </section>
      )}
      <footer className="home-footer"><span>Blind Exam Room</span><span>Practice with focus. Compete with fairness.</span></footer>
    </main>
  );
}
