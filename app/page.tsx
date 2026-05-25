// app/page.tsx
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ── Replace these with your actual contact info ──────────────────
const CONTACT_EMAIL = "jmw9871@gmail.com"; // ← 이메일 주소 입력
const X_HANDLE = "yourhandle"; // ← X(트위터) 핸들 (@제외)
const X_URL = `https://x.com/${X_HANDLE}`;
// ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        {/* Hero */}
        <div className="max-w-xl mb-10">
          <div className="text-5xl mb-5">⚖️</div>
          <h1 className="text-4xl font-semibold tracking-tight mb-4 text-gray-900">
            Find risky clauses in your contracts — instantly
          </h1>
          <p className="text-gray-600 text-base max-w-md mx-auto mb-8">
            Upload any contract (PDF, DOCX, TXT) and get an instant risk
            analysis. Know what to negotiate before you sign.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/auth?mode=signup"
              className="bg-black text-white text-sm px-6 py-2.5 rounded-xl hover:bg-gray-800 transition-colors"
            >
              Analyze a contract free →
            </Link>
            <Link
              href="/auth"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign in
            </Link>
          </div>
          <p className="text-xs text-gray-800 mt-3">
            ✦ Free during Beta &nbsp;·&nbsp; No credit card required
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full mb-10">
          {[
            {
              emoji: "🔴",
              title: "Risk Detection",
              desc: "Automatically flags high-risk clauses like unlimited liability, auto-renewal, and non-compete terms.",
            },
            {
              emoji: "💬",
              title: "Ask Anything",
              desc: "Chat with your contract. Ask about specific clauses, party obligations, or termination conditions.",
            },
            {
              emoji: "🌐",
              title: "Korean & English",
              desc: "Supports both Korean and English contracts with language-aware analysis.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="border border-gray-200 rounded-xl p-4 text-left hover:border-gray-300 transition-colors"
            >
              <div className="text-2xl mb-2">{f.emoji}</div>
              <p className="text-sm font-medium text-gray-800 mb-1">
                {f.title}
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Supported formats */}
        <p className="text-xs text-gray-500">
          Supports PDF · DOCX · TXT · up to 10MB
        </p>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          {/* Left — Contact */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>✉️</span>
            <span className="font-medium text-gray-700">
              Feedback &amp; Bug Reports:
            </span>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-gray-700 hover:text-black underline underline-offset-2 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          {/* Center — Tech stack */}
          <p className="text-xs text-gray-400 hidden sm:block">
            Built with Next.js · Claude API · Pinecone · Supabase
          </p>

          {/* Right — Social links */}
          <div className="flex items-center gap-3">
            {/* X (Twitter) */}
            <a
              href={X_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-black transition-colors"
              aria-label="Follow on X"
            >
              {/* X logo SVG */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>@{X_HANDLE}</span>
            </a>
          </div>
        </div>

        {/* Mobile: tech stack below */}
        <p className="text-xs text-gray-400 text-center mt-3 sm:hidden">
          Built with Next.js · Claude API · Pinecone · Supabase
        </p>
      </footer>
    </div>
  );
}
