"use client";

// app/dashboard/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import FileUploader from "@/components/FileUploader";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
type RiskLevel = "high" | "medium" | "low" | "unknown";

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  char_count: number;
  chunk_count: number;
  created_at: string;
  overall_risk: RiskLevel;
  high_risk_sections: string[];
  medium_risk_sections: string[];
  detected_language: string;
}

interface UploadResult {
  docId: string;
  overallRisk: RiskLevel;
  highRiskSections: string[];
  mediumRiskSections: string[];
  detectedLanguage: string;
  chunkCount: number;
}

// ─────────────────────────────────────────
// Risk badge
// ─────────────────────────────────────────
const RISK_BADGE: Record<
  RiskLevel,
  { emoji: string; label: string; class: string }
> = {
  high: { emoji: "🔴", label: "High Risk", class: "bg-red-100 text-red-600" },
  medium: {
    emoji: "🟡",
    label: "Medium Risk",
    class: "bg-yellow-100 text-yellow-600",
  },
  low: { emoji: "🟢", label: "Low Risk", class: "bg-green-100 text-green-600" },
  unknown: {
    emoji: "⚪",
    label: "Analyzing",
    class: "bg-gray-100 text-gray-500",
  },
};

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const config = RISK_BADGE[risk] ?? RISK_BADGE.unknown;
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.class}`}
    >
      {config.emoji} {config.label}
    </span>
  );
}

// ─────────────────────────────────────────
// Main component
// ─────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploader, setShowUploader] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }
      await fetchDocuments();
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDocuments = async () => {
    const { data, error } = await supabaseClient
      .from("documents")
      .select(
        "id, file_name, file_type, char_count, chunk_count, created_at, overall_risk, high_risk_sections, medium_risk_sections, detected_language",
      )
      .order("created_at", { ascending: false });

    if (!error && data) setDocuments(data as Document[]);
  };

  // Delete document — also cleans up Pinecone via API
  const handleDelete = async (docId: string) => {
    setDeleteConfirmId(null);

    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const token = session?.access_token ?? "";

    // Delete vectors from Pinecone
    try {
      await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error("Failed to delete vectors from Pinecone:", e);
      // Continue with Supabase delete even if Pinecone fails
    }

    const { error } = await supabaseClient
      .from("documents")
      .delete()
      .eq("id", docId);

    if (!error) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } else {
      console.error("Failed to delete document from Supabase:", error.message);
    }
  };

  // Upload complete — updated signature to accept full result
  const handleUploadComplete = async (_docId: string, result: UploadResult) => {
    setShowUploader(false);
    await fetchDocuments();
    router.push(`/dashboard/${result.docId}`);
  };

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <main className="max-w-2xl mx-auto mt-32 px-4 text-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto mt-16 px-4 pb-20">
      <Navbar />

      {/* Upload area */}
      {showUploader ? (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              Upload a contract
            </p>
            <button
              onClick={() => setShowUploader(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
          <FileUploader onUploadComplete={handleUploadComplete} />
        </div>
      ) : (
        <button
          onClick={() => setShowUploader(true)}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors mb-8"
        >
          + Upload new contract
        </button>
      )}

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-gray-500 text-sm font-medium">No contracts yet.</p>
          <p className="text-gray-300 text-xs mt-1">
            Upload a PDF, DOCX, or TXT contract to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-3">
            {documents.length} contract{documents.length > 1 ? "s" : ""}
          </p>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                {/* Doc info — click to open chat */}
                <button
                  onClick={() => router.push(`/dashboard/${doc.id}`)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-medium truncate">
                      {doc.file_name}
                    </p>
                    <RiskBadge risk={doc.overall_risk ?? "unknown"} />
                  </div>
                  <p className="text-xs text-gray-400">
                    {doc.chunk_count} sections ·{" "}
                    {doc.detected_language === "ko"
                      ? "Korean"
                      : doc.detected_language === "en"
                        ? "English"
                        : "Mixed"}{" "}
                    · {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                  {/* High risk section preview */}
                  {doc.high_risk_sections?.length > 0 && (
                    <p className="text-xs text-red-500 mt-1 truncate">
                      🔴 {doc.high_risk_sections.slice(0, 2).join(", ")}
                      {doc.high_risk_sections.length > 2 &&
                        ` +${doc.high_risk_sections.length - 2} more`}
                    </p>
                  )}
                </button>

                {/* Delete with confirmation */}
                {deleteConfirmId === doc.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">Delete?</span>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(doc.id)}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-5 mb-3 text-center">
        <p className="text-sm md:text-base text-red-500">
          Caution: ClauseCheck AI provides general contract information only and
          does not constitute legal advice. For important legal matters, please
          consult a qualified attorney.
        </p>
      </div>
    </main>
  );
}
