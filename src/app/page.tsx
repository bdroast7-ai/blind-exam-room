import Link from "next/link";
import { db } from "@/db";
import { exams, players } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import Lobby from "@/components/Lobby";

export const dynamic = "force-dynamic";

export default async function Home() {
  const recent = await db
    .select()
    .from(exams)
    .where(eq(exams.status, "finished"))
    .orderBy(desc(exams.endsAt))
    .limit(8);
  const ps = recent.length
    ? await db.select({ examId: players.examId, name: players.name }).from(players).where(inArray(players.examId, recent.map((r) => r.id)))
    : [];
  const names = [...new Set(ps.map((p) => p.name.trim()))];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Weekend MCQ Battle <span className="text-indigo-600">— zero spoilers.</span>
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Snap your week&apos;s pages → AI builds a tagged exam with hidden explanations → 4 friends race the clock → instant
          review sheet &amp; per-topic weak-point diagnosis.
        </p>
        <ol className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
          {["Upload pages", "AI extraction", "Live exam room", "Instant review", "Weak-point analytics"].map((s, i) => (
            <li key={s} className="rounded-full border border-slate-200 bg-white px-3 py-1">
              <span className="mr-1 text-indigo-600">{i + 1}.</span>
              {s}
            </li>
          ))}
        </ol>
      </section>

      <Lobby />

      {recent.length > 0 && (
        <section className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="card p-6 lg:col-span-2">
            <h2 className="font-bold">Past exams — review anytime</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.endsAt?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {e.questionCount} Q ·{" "}
                      {ps.filter((p) => p.examId === e.id).map((p) => p.name).join(", ")}
                    </p>
                  </div>
                  <Link href={`/exam/${e.code}`} className="text-indigo-600 hover:underline">
                    Solution sheet →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="font-bold">Lifetime weak-point profiles</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {names.map((n) => (
                <Link key={n} href={`/profile/${encodeURIComponent(n)}`} className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-100">
                  {n}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
