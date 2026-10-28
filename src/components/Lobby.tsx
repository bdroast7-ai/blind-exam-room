"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession } from "@/lib/ui";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  render,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          type="button"
          key={String(o)}
          onClick={() => onChange(o)}
          className={`seg ${
            value === o
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:border-indigo-300"
          }`}
        >
          {render ? render(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

export default function Lobby() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [hostName, setHostName] = useState("");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [count, setCount] = useState<20 | 25>(20);
  const [duration, setDuration] = useState<10 | 15 | 20>(15);
  const [neg, setNeg] = useState<"0" | "0.25" | "0.5">("0.25");
  const [genErr, setGenErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const n = localStorage.getItem("wme:lastName");
    if (n) {
      setName(n);
      setHostName(n);
    }
  }, []);

  async function compressImage(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) return file; // Leave PDFs as-is
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_DIM = 1600;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.75
        );
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const raw = Array.from(list).filter((f) => f.type === "application/pdf" || f.type.startsWith("image/"));
    const compressed = await Promise.all(raw.map(compressImage));
    setFiles((prev) => {
      const next = [...prev, ...compressed];
      const size = next.reduce((sum, file) => sum + file.size, 0);
      if (size > MAX_UPLOAD_BYTES) {
        setGenErr("Upload is too large for the current server setup. Keep the combined PDF/images under 4 MB, or split/compress the PDF and try again.");
        return prev;
      }
      setGenErr(null);
      return next;
    });
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setJoinErr(null);
    if (!/^\d{6}$/.test(code)) return setJoinErr("Exam code must be 6 digits");
    setJoining(true);
    try {
      const r = await fetch(`/api/exams/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not join");
      saveSession(code, { token: d.token, name: d.name });
      router.push(`/exam/${code}`);
    } catch (err) {
      setJoinErr(err instanceof Error ? err.message : "Failed");
      setJoining(false);
    }
  }

  async function generate(demo: boolean) {
    setGenErr(null);
    if (!hostName.trim()) return setGenErr("Enter your name");
    if (!demo && files.length === 0) return setGenErr("Add at least one PDF or page photo");
    setGenerating(true);
    try {
      const fd = new FormData();
      fd.set("hostName", hostName.trim());
      fd.set("title", title.trim());
      fd.set("questionCount", String(count));
      fd.set("durationMin", String(duration));
      fd.set("negativeMark", neg);
      if (demo) fd.set("demo", "1");
      else files.forEach((f) => fd.append("files", f));
      const r = await fetch("/api/exams", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({ error: "Server error" }));
      if (!r.ok) throw new Error(d.error || "Generation failed");
      saveSession(d.code, { token: d.token, name: d.name });
      if (d.warning) sessionStorage.setItem(`wme:warn:${d.code}`, d.warning);
      router.push(`/exam/${d.code}`);
    } catch (err) {
      setGenErr(err instanceof Error ? err.message : "Failed");
      setGenerating(false);
    }
  }

  const totalMb = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;

  return (
    <div className="lobby-grid grid gap-5 lg:grid-cols-5">
      {/* LEFT: Join */}
      <form onSubmit={join} className="card join-card p-5 sm:p-6 lg:col-span-2">
        <p className="section-kicker">ALREADY HAVE A CODE?</p><h2 className="mt-1 text-xl font-bold tracking-tight">Join an exam</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">Enter the six-digit room code shared by your host.</p>
        <label className="mt-5 block text-sm font-medium">Your name</label>
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rafi" maxLength={40} required />
        <label className="mt-4 block text-sm font-medium">6-digit Exam Code</label>
        <input
          className="input mt-1 text-center font-mono text-2xl tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          required
        />
        {joinErr && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{joinErr}</p>}
        <button className="btn-primary mt-5 w-full" disabled={joining}>
          {joining ? "Joining…" : "Enter Exam Room →"}
        </button>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
          🔒 <b>Zero-spoiler:</b> while the clock runs your phone only receives the questions and options. Answers and
          explanations are unlocked by the server when time hits 00:00 or everyone submits.
        </div>
      </form>

      {/* RIGHT: Upload & generate */}
      <div className="card create-card p-5 sm:p-6 lg:col-span-3">
        <p className="section-kicker">HOST A NEW SESSION</p><h2 className="mt-1 text-xl font-bold tracking-tight">Create an exam</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload study material and turn it into a timed MCQ challenge. Answers stay hidden until the session ends.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Your name (host)</label>
            <input className="input mt-1" value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="e.g. Rafi" maxLength={40} />
          </div>
          <div>
            <label className="block text-sm font-medium">Exam title (optional)</label>
            <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 12 — Friday Night" maxLength={80} />
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`upload-zone mt-4 cursor-pointer rounded-xl border border-dashed p-6 text-center transition ${
            drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
          }`}
        >
          <div className="upload-icon mx-auto grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-xl text-indigo-600">↑</div>
          <p className="mt-3 text-sm font-semibold">Drop your study pages here</p>
          <p className="mt-1 text-xs text-slate-500">PDF or image files · Multiple files supported · Up to 4 MB total</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                <span className="truncate">
                  {f.type === "application/pdf" ? "📄" : "🖼️"} {f.name}{" "}
                  <span className="text-xs text-slate-400">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                </span>
                <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  remove
                </button>
              </li>
            ))}
            <li className={`text-right text-xs ${totalMb > 4 ? "text-red-600" : "text-slate-400"}`}>Total {totalMb.toFixed(1)} MB · max 4 MB</li>
          </ul>
        )}

        <div className="settings-grid mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-1.5 text-sm font-medium">Questions</p>
            <Seg value={count} options={[20, 25] as (20 | 25)[]} onChange={setCount} />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Time</p>
            <Seg value={duration} options={[10, 15, 20] as (10 | 15 | 20)[]} onChange={setDuration} render={(v) => `${v}m`} />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Negative marking</p>
            <Seg
              value={neg}
              options={["0", "0.25", "0.5"] as ("0" | "0.25" | "0.5")[]}
              onChange={setNeg}
              render={(v) => (v === "0" ? "Off" : `-${v}`)}
            />
          </div>
        </div>

        {genErr && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{genErr}</p>}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary flex-1" disabled={generating} onClick={() => generate(false)}>
            {generating ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Reading pages &amp; building MCQs (takes ~30s)...
              </>
            ) : (
              "Generate exam"
            )}
          </button>
          <button type="button" className="btn-ghost" disabled={generating} onClick={() => generate(true)} title="Use the built-in sample question bank">
            Use sample questions
          </button>
        </div>
      </div>
    </div>
  );
}
