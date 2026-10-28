"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExamState } from "@/lib/types";
import { fmtTime, loadSession, optionLetter, saveSession, subjectStyle, type Session } from "@/lib/ui";
import Results from "./Results";

export default function ExamRoom({ code }: { code: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ExamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const answersInit = useRef(false);

  useEffect(() => {
    setSession(loadSession(code));
    setWarning(sessionStorage.getItem(`wme:warn:${code}`));
    setReady(true);
  }, [code]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/exams/${code}`, {
        headers: session ? { "x-player-token": session.token } : {},
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      const s = d as ExamState;
      setOffset(new Date(s.serverNow).getTime() - Date.now());
      setState(s);
      if (s.me && !answersInit.current && s.status !== "lobby") {
        setAnswers(s.me.answers);
        answersInit.current = true;
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    }
  }, [code, session]);

  // polling
  useEffect(() => {
    if (!ready) return;
    refresh();
    if (state?.status === "finished") return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [ready, refresh, state?.status]);

  // ticking clock
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = state?.endsAt ? new Date(state.endsAt).getTime() - (now + offset) : 0;
  const timeUp = state?.status === "running" && remaining <= 0;
  useEffect(() => {
    if (timeUp) refresh();
  }, [timeUp, refresh]);

  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    "x-player-token": session?.token ?? "",
  });

  async function pick(qid: number, choice: number) {
    const prev = answers;
    const next = { ...answers };
    const clear = next[String(qid)] === choice;
    if (clear) delete next[String(qid)];
    else next[String(qid)] = choice;
    setAnswers(next);
    const r = await fetch(`/api/exams/${code}/answer`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ questionId: qid, choice: clear ? null : choice }),
    }).catch(() => null);
    if (!r || !r.ok) {
      setAnswers(prev);
      refresh();
    }
  }

  function normalizeName(value: string) {
    return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  }

  async function start() {
    const isHost = !!state?.me && !!state.hostName && normalizeName(state.me.name) === normalizeName(state.hostName);
    const canStartByGroup = (state?.players?.length ?? 0) >= 4;
    const canStart = isHost || canStartByGroup;
    if (!canStart) return;
    if (!isHost && canStartByGroup && !confirm("All 4 players are in the room. Start the exam for everyone?")) return;
    await fetch(`/api/exams/${code}/start`, { method: "POST", headers: authHeaders() });
    refresh();
  }

  async function submit() {
    const total = state?.questions?.length ?? 0;
    const left = total - Object.keys(answers).length;
    if (!confirm(left > 0 ? `${left} question(s) unanswered. Submit anyway?` : "Submit your paper?")) return;
    await fetch(`/api/exams/${code}/submit`, { method: "POST", headers: authHeaders() });
    refresh();
  }

  if (!ready) return null;

  if (error && !state) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-center">
        <p className="text-lg font-semibold">😕 {error}</p>
        <a href="/" className="btn-primary mt-4">Back to lobby</a>
      </div>
    );
  }
  if (!state) return <p className="mt-16 text-center text-slate-500">Loading exam room…</p>;

  // FINISHED → results (viewable by anyone with the code)
  if (state.status === "finished") return <Results code={code} meName={state.me?.name ?? session?.name ?? null} />;

  // Not joined
  if (!state.me) {
    return (
      <JoinGate
        code={code}
        canJoin={state.status === "lobby"}
        onJoined={(s) => {
          saveSession(code, s);
          setSession(s);
        }}
      />
    );
  }

  const neg = state.negativeMark ? `-${state.negativeMark}` : "Off";
  const isHost = !!state.me && !!state.hostName && normalizeName(state.me.name) === normalizeName(state.hostName);
  const canStartByGroup = state.players.length >= 4;
  const canStart = isHost || canStartByGroup;

  // LOBBY / waiting room
  if (state.status === "lobby") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        {warning && <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">⚠️ {warning}</div>}
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500">Share this Exam Room Code with your friends</p>
          <p className="mt-2 font-mono text-5xl font-extrabold tracking-[0.3em] text-indigo-600">{state.code}</p>
          <button
            className="mt-3 text-xs text-indigo-600 hover:underline"
            onClick={() => navigator.clipboard?.writeText(`${location.origin}/exam/${state.code}`)}
          >
            Copy invite link
          </button>
          <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <Stat label="Questions" value={String(state.questionCount)} />
            <Stat label="Time" value={`${state.durationMin} min`} />
            <Stat label="Negative" value={neg} />
          </div>
        </div>
        <div className="card mt-6 p-6">
          <h3 className="font-bold">In the room ({state.players.length})</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {state.players.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium">{p.name}</span>
                {p.name === state.hostName && <span className="text-xs text-slate-400">host</span>}
                {p.id === state.me!.id && <span className="ml-auto text-xs text-indigo-600">you</span>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Everyone gets the exact same paper. Once started, the timer is synced from the server and late entry closes.
          </p>
          <button className="btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60" onClick={start} disabled={!canStart}>
            {isHost ? "▶ Start exam for everyone" : canStartByGroup ? "▶ Start exam for everyone" : "Waiting for host to start"}
          </button>
          {!canStart && <p className="mt-2 text-center text-xs text-slate-500">Only the host can start until all 4 players are in the room.</p>}
        </div>
      </div>
    );
  }

  // RUNNING
  const qs = state.questions ?? [];
  const answered = Object.keys(answers).length;
  const urgent = remaining < 60_000;

  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <div className={`font-mono text-2xl font-bold tabular-nums ${urgent ? "animate-pulse text-red-600" : "text-slate-900"}`}>
            ⏱ {fmtTime(remaining)}
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>
                Answered: <b className="text-slate-800">{answered}/{qs.length}</b>
              </span>
              <span>Neg: {neg}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${qs.length ? (answered / qs.length) * 100 : 0}%` }} />
            </div>
          </div>
          {!state.me.submitted && (
            <button className="btn-primary" onClick={submit}>
              Submit
            </button>
          )}
        </div>
      </div>

      {state.me.submitted ? (
        <div className="mx-auto max-w-md px-4 py-12">
          <div className="card p-6 text-center">
            <p className="text-4xl">✅</p>
            <p className="mt-2 text-lg font-bold">Paper submitted</p>
            <p className="mt-1 text-sm text-slate-500">Results unlock when the timer hits 00:00 or everyone submits.</p>
            <ul className="mt-5 space-y-2 text-left">
              {state.players.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className={p.submitted ? "text-emerald-600" : "text-slate-400"}>
                    {p.submitted ? "Submitted" : `Writing… ${p.answeredCount}/${qs.length}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {qs.map((q) => {
            const st = subjectStyle(q.subject);
            const mine = answers[String(q.id)];
            return (
              <div key={q.id} className="card p-5">
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-400">Q{q.idx}</span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${st.chip}`}>{st.label}</span>
                  <span className="text-slate-400">{q.subTopic}</span>
                </div>
                <p className="whitespace-pre-line font-medium leading-relaxed">{q.question}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {q.options.map((o, i) => (
                    <button
                      key={i}
                      onClick={() => pick(q.id, i)}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        mine === i ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          mine === i ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {optionLetter(q.subject, i)}
                      </span>
                      <span className="pt-0.5">{o}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <button className="btn-primary w-full py-3" onClick={submit}>
            Submit paper ({answered}/{qs.length} answered)
          </button>
          <p className="pb-6 text-center text-xs text-slate-400">Tap a selected option again to clear it (skip = 0 marks).</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function JoinGate({ code, canJoin, onJoined }: { code: string; canJoin: boolean; onJoined: (s: Session) => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(localStorage.getItem("wme:lastName") ?? ""), []);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/exams/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Could not join");
    onJoined({ token: d.token, name: d.name });
  }
  return (
    <form onSubmit={go} className="card mx-auto mt-12 max-w-sm p-6">
      <p className="text-sm text-slate-500">Exam Room</p>
      <p className="font-mono text-3xl font-bold tracking-widest text-indigo-600">{code}</p>
      {!canJoin && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This exam is already running. Only players who joined before the start can re-enter (use the same name).
        </p>
      )}
      <label className="mt-4 block text-sm font-medium">Your name</label>
      <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <button className="btn-primary mt-4 w-full" disabled={busy}>
        {busy ? "Joining…" : "Enter"}
      </button>
    </form>
  );
}
