"use client";

// app/dashboard/[docId]/page.tsx

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import ChatWindow from "@/components/ChatWindow";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
type RiskLevel = "high" | "medium" | "low" | "unknown";

interface DocumentDetail {
  id: string;
  file_name: string;
  file_type: string;
  chunk_count: number;
  created_at: string;
  overall_risk: RiskLevel;
  high_risk_sections: string[];
  medium_risk_sections: string[];
  detected_language: string;
}

// ─────────────────────────────────────────
// Risk summary banner
// ─────────────────────────────────────────
const RISK_BANNER: Record<
  RiskLevel,
  {
    bg: string;
    border: string;
    titleColor: string;
    emoji: string;
    title: string;
  }
> = {
  high: {
    bg: "bg-red-50",
    border: "border-red-200",
    titleColor: "text-red-700",
    emoji: "🔴",
    title: "High Risk Contract",
  },
  medium: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    titleColor: "text-yellow-700",
    emoji: "🟡",
    title: "Medium Risk Contract",
  },
  low: {
    bg: "bg-green-50",
    border: "border-green-200",
    titleColor: "text-green-700",
    emoji: "🟢",
    title: "Low Risk Contract",
  },
  unknown: {
    bg: "bg-gray-50",
    border: "border-gray-200",
    titleColor: "text-gray-600",
    emoji: "⚪",
    title: "Analysis Pending",
  },
};

function RiskBanner({ doc }: { doc: DocumentDetail }) {
  const config = RISK_BANNER[doc.overall_risk ?? "unknown"];

  return (
    <div className={`rounded-xl border p-4 mb-4 ${config.bg} ${config.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{config.emoji}</span>
        <span className={`font-semibold text-sm ${config.titleColor}`}>
          {config.title}
        </span>
        <span className="ml-auto text-xs text-gray-400">
          {doc.chunk_count} sections analyzed
        </span>
      </div>

      {doc.high_risk_sections?.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-red-600 mb-1">
            🔴 Requires Immediate Review
          </p>
          <ul className="space-y-0.5">
            {doc.high_risk_sections.map((s, i) => (
              <li
                key={i}
                className="text-xs text-red-700 pl-2 border-l-2 border-red-300"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {doc.medium_risk_sections?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-yellow-600 mb-1">
            🟡 Review Recommended
          </p>
          <ul className="space-y-0.5">
            {doc.medium_risk_sections.map((s, i) => (
              <li
                key={i}
                className="text-xs text-yellow-700 pl-2 border-l-2 border-yellow-300"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {doc.overall_risk === "low" && (
        <p className="text-xs text-green-600">
          No high-risk clauses detected. Ask questions below to review specific
          terms.
        </p>
      )}

      <p className="text-xs text-gray-400 mt-2">
        Language:{" "}
        {doc.detected_language === "ko"
          ? "Korean"
          : doc.detected_language === "en"
            ? "English"
            : "Korean/English Mixed"}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────
// Main component
// ─────────────────────────────────────────
export default function DocChatPage() {
  const router = useRouter();
  const params = useParams();
  const docId = params?.docId as string;

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }

      const { data, error } = await supabaseClient
        .from("documents")
        .select(
          "id, file_name, file_type, chunk_count, created_at, overall_risk, high_risk_sections, medium_risk_sections, detected_language",
        )
        .eq("id", docId)
        .single();

      if (error || !data) {
        console.error("Failed to load document:", error?.message);
        setNotFound(true);
      } else {
        setDoc(data as DocumentDetail);
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // ─────────────────────────────────────────
  // Render states
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <main className="max-w-2xl mx-auto mt-32 px-4 text-center">
        <p className="text-sm text-gray-400">Loading contract...</p>
      </main>
    );
  }

  if (notFound || !doc) {
    return (
      <main className="max-w-2xl mx-auto mt-32 px-4 text-center">
        <p className="text-2xl mb-3">📋</p>
        <p className="text-gray-600 text-sm font-medium">Contract not found.</p>
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-4 text-sm text-gray-400 underline hover:text-gray-600"
        >
          Back to dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto mt-16 px-4 pb-20">
      <Navbar />

      {/* Back nav */}
      <button
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
      >
        ← Back to dashboard
      </button>

      {/* Document title */}
      <h1 className="text-lg font-semibold text-gray-800 mb-1 truncate">
        {doc.file_name}
      </h1>
      <p className="text-xs text-gray-400 mb-4">
        Uploaded {new Date(doc.created_at).toLocaleDateString()} ·{" "}
        {doc.chunk_count} sections
      </p>

      {/* Risk banner */}
      <RiskBanner doc={doc} />

      {/* Chat */}
      <ChatWindow
        docId={docId}
        overallRisk={doc.overall_risk}
        fileName={doc.file_name}
      />
    </main>
  );
}
