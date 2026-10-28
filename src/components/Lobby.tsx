"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession } from "@/lib/ui";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const PDFJS_SCRIPT = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const JSPDF_SCRIPT = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-compressor-src="' + src + '"]');
    if (existing && existing.dataset.loaded === "true") return resolve();
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load PDF compressor.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.compressorSrc = src;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => { script.remove(); reject(new Error("Could not load the browser PDF compressor. Check your internet connection and retry.")); };
    document.head.appendChild(script);
  });
}

type PdfPage = {
  getViewport: (args: { scale: number }) => { width: number; height: number };
  render: (args: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};
type PdfDocument = { numPages: number; getPage: (page: number) => Promise<PdfPage> };
type PdfJsApi = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (args: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
};
type JsPdfDoc = {
  addPage: (format: number[]) => void;
  addImage: (data: string, format: string, x: number, y: number, width: number, height: number) => void;
  output: (type: "blob") => Blob;
};
type JsPdfApi = { jsPDF: new (options: { unit: string; format: number[]; compress: boolean }) => JsPdfDoc };

async function compressPdf(file: File): Promise<File> {
  await Promise.all([loadScript(PDFJS_SCRIPT), loadScript(JSPDF_SCRIPT)]);
  const globals = window as unknown as { pdfjsLib?: PdfJsApi; jspdf?: JsPdfApi };
  const pdfjs = globals.pdfjsLib;
  const JsPDF = globals.jspdf && globals.jspdf.jsPDF;
  if (!pdfjs || !JsPDF) throw new Error("PDF compressor failed to initialize. Reload the page and retry.");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > 30) throw new Error("This PDF has more than 30 pages. Split it into smaller PDFs and upload each part.");
  const presets = [{ scale: 1.35, quality: 0.7 }, { scale: 1.05, quality: 0.55 }, { scale: 0.85, quality: 0.45 }];
  for (const preset of presets) {
    let output: JsPdfDoc | null = null;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: preset.scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare this PDF for compression.");
      await page.render({ canvasContext: context, viewport: { width: canvas.width, height: canvas.height } }).promise;
      const image = canvas.toDataURL("image/jpeg", preset.quality);
      const width = viewport.width / preset.scale;
      const height = viewport.height / preset.scale;
      if (!output) output = new JsPDF({ unit: "pt", format: [width, height], compress: true });
      else output.addPage([width, height]);
      output.addImage(image, "JPEG", 0, 0, width, height);
      canvas.width = 1;
      canvas.height = 1;
    }
    if (!output) throw new Error("The PDF contains no pages.");
    const blob = output.output("blob");
    if (blob.size <= MAX_UPLOAD_BYTES) {
      return new File([blob], file.name.replace(/\.pdf$/i, "-compressed.pdf"), { type: "application/pdf" });
    }
  }
  throw new Error("This PDF is still over 3 MB after compression. Split it into smaller PDFs or upload fewer pages.");
}

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
  const [compressing, setCompressing] = useState(false);
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
    if (!file.type.startsWith("image/")) return file;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not read image: " + file.name));
        image.src = url;
      });
      let maxDim = 1800;
      let quality = 0.78;
      for (let attempt = 0; attempt < 4; attempt++) {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Your browser could not compress this image.");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        canvas.width = 1;
        canvas.height = 1;
        if (blob && (blob.size < file.size || attempt === 3)) {
          return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
        }
        maxDim = Math.round(maxDim * 0.78);
        quality *= 0.78;
      }
      return file;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const raw = Array.from(list).filter((f) => f.type === "application/pdf" || f.type.startsWith("image/"));
    if (raw.length === 0) {
      setGenErr("Choose a PDF, JPG, PNG or WEBP file.");
      return;
    }
    setGenErr(null);
    setCompressing(true);
    try {
      const incoming = await Promise.all(raw.map(async (file) => {
        if (file.type === "application/pdf" && file.size > 1024 * 1024) return compressPdf(file);
        return compressImage(file);
      }));
      let next = [...files, ...incoming];
      let totalBytes = next.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_UPLOAD_BYTES) {
        next = await Promise.all(next.map(async (file) => {
          if (file.type === "application/pdf") return compressPdf(file);
          return compressImage(file);
        }));
        totalBytes = next.reduce((sum, file) => sum + file.size, 0);
      }
      if (totalBytes > MAX_UPLOAD_BYTES) throw new Error("The compressed files are still over 3 MB total. Split the PDF or upload fewer pages.");
      setFiles(next);
      setGenErr(null);
    } catch (error) {
      setGenErr(error instanceof Error ? error.message : "File compression failed. Try a smaller file.");
    } finally {
      setCompressing(false);
    }
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
      const d = await r.json().catch(() => ({ error: r.status === 413 ? "Upload too large for the hosting request limit. Compress or split the PDF and try again." : `Server error (HTTP ${r.status})` }));
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
          <p className="mt-1 text-xs text-slate-500">PDF or image files · Automatically compresses large files · 3 MB target</p>
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
            <li className={`text-right text-xs ${totalMb > 3 ? "text-red-600" : "text-slate-400"}`}>Total {totalMb.toFixed(1)} MB · target max 3 MB</li>
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
          <button type="button" className="btn-primary flex-1" disabled={generating || compressing} onClick={() => generate(false)}>
            {compressing ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Compressing files…
              </>
            ) : generating ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Reading pages &amp; building MCQs (takes ~30s)...
              </>
            ) : (
              "Generate exam"
            )}
          </button>
          <button type="button" className="btn-ghost" disabled={generating || compressing} onClick={() => generate(true)} title="Use the built-in sample question bank">
            Use sample questions
          </button>
        </div>
      </div>
    </div>
  );
}
