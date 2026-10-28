import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blind Exam Room — Private MCQ Practice",
  description: "Turn your study pages into a private MCQ exam, compete with friends and review your weak points.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body className="min-h-screen text-slate-900 antialiased">
        <header className="site-header sticky top-0 z-20 border-b border-slate-200">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
            <Link href="/" className="flex items-center gap-3 font-bold tracking-tight">
              <span className="brand-mark grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white"><span aria-hidden="true">↗</span></span>
              <span><span className="block text-sm leading-5">Blind Exam Room</span><span className="block text-[10px] font-medium tracking-wide text-slate-500">PRIVATE PRACTICE · ZERO SPOILERS</span></span>
            </Link>
            <span className="hidden text-xs font-medium text-slate-500 sm:block">বাংলা <span className="mx-1 text-slate-300">/</span> English <span className="mx-1 text-slate-300">/</span> গণিত <span className="mx-1 text-slate-300">/</span> সাধারণ জ্ঞান</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
