import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blind Exam Room — Weekend MCQ Battle",
  description:
    "Upload your week's Bangla, English, Math & GK pages, let Gemini build a zero-spoiler MCQ exam, battle your friends live and find your weak points.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">✎</span>
              Blind Exam Room
            </Link>
            <span className="hidden text-xs text-slate-500 sm:block">বাংলা · English · গণিত · সাধারণ জ্ঞান</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
