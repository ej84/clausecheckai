"use client";

// components/FileUploader.tsx
// v2 — adds contract type selection for per-type risk calibration

import { useState, useRef, useCallback } from "react";
import { supabaseClient } from "@/lib/supabase";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
type UploadStatus = "idle" | "uploading" | "done" | "error";
type RiskLevel = "high" | "medium" | "low" | "unknown";

export type ContractType =
  | "employment"
  | "nda"
  | "saas"
  | "freelance"
  | "partnership"
  | "lease"
  | "general";

export interface UploadResult {
  docId: string;
  overallRisk: RiskLevel;
  highRiskSections: string[];
  mediumRiskSections: string[];
  detectedLanguage: string;
  chunkCount: number;
  contractType: ContractType;
}

interface FileUploaderProps {
  onUploadComplete: (docId: string, result: UploadResult) => void;
}

// ─────────────────────────────────────────
// Contract type options
// ─────────────────────────────────────────
export const CONTRACT_TYPE_OPTIONS: {
  value: ContractType;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "general",
    label: "Not sure / General",
    description: "Auto-detect contract type",
    icon: "📄",
  },
  {
    value: "employment",
    label: "Employment Contract",
    description: "Job offer, work agreement",
    icon: "💼",
  },
  {
    value: "nda",
    label: "NDA / Confidentiality",
    description: "Non-disclosure agreement",
    icon: "🔒",
  },
  {
    value: "saas",
    label: "SaaS / Software",
    description: "Software license, terms of service",
    icon: "💻",
  },
  {
    value: "freelance",
    label: "Freelance / Service",
    description: "Independent contractor, service agreement",
    icon: "🤝",
  },
  {
    value: "partnership",
    label: "Partnership / Equity",
    description: "Business partnership, shareholder agreement",
    icon: "🏢",
  },
  {
    value: "lease",
    label: "Lease / Rental",
    description: "Property or equipment lease",
    icon: "🏠",
  },
];

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".docx", ".doc"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

// ─────────────────────────────────────────
// Risk level UI config
// ─────────────────────────────────────────
const RISK_CONFIG: Record<
  RiskLevel,
  { emoji: string; label: string; bg: string; text: string; border: string }
> = {
  high: {
    emoji: "🔴",
    label: "HIGH RISK",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
  medium: {
    emoji: "🟡",
    label: "MEDIUM RISK",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
  },
  low: {
    emoji: "🟢",
    label: "LOW RISK",
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  unknown: {
    emoji: "⚪",
    label: "Analyzing",
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-200",
  },
};

// ─────────────────────────────────────────
// File validation
// ─────────────────────────────────────────
function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File size exceeds ${MAX_FILE_SIZE_MB}MB. (Current: ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
  }
  const name = file.name.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
  const hasValidMime = ALLOWED_MIME_TYPES.includes(file.type);
  if (!hasValidExt && !hasValidMime) {
    return "Only PDF, TXT, and DOCX files are allowed.";
  }
  return null;
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────
export default function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [contractType, setContractType] = useState<ContractType>("general");
  const [showTypeSelector, setShowTypeSelector] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = CONTRACT_TYPE_OPTIONS.find(
    (o) => o.value === contractType,
  )!;

  // ── Upload ───────────────────────────────
  const processFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setErrorMessage(validationError);
        setStatus("error");
        return;
      }

      setFileName(file.name);
      setStatus("uploading");
      setErrorMessage("");
      setUploadResult(null);
      setUploadProgress(10);

      abortControllerRef.current = new AbortController();

      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        const token = session?.access_token ?? "";

        setUploadProgress(30);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("contractType", contractType);

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
          signal: abortControllerRef.current.signal,
        });

        setUploadProgress(80);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Upload failed (HTTP ${res.status})`);
        }

        const result: UploadResult = await res.json();
        setUploadProgress(100);
        setUploadResult(result);
        setStatus("done");
        onUploadComplete(result.docId, result);
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setStatus("idle");
          setFileName("");
        } else {
          setErrorMessage(
            e instanceof Error ? e.message : "An unknown error occurred.",
          );
          setStatus("error");
        }
      } finally {
        setUploadProgress(0);
        abortControllerRef.current = null;
      }
    },
    [onUploadComplete, contractType],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleCancel = () => abortControllerRef.current?.abort();
  const handleRetry = () => {
    setStatus("idle");
    setErrorMessage("");
    setFileName("");
    inputRef.current?.click();
  };

  const riskConfig = uploadResult
    ? RISK_CONFIG[uploadResult.overallRisk]
    : null;

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="w-full space-y-3">
      {/* ── Contract Type Selector ── */}
      {status === "idle" && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Contract type</p>

          {/* Selected type button */}
          <button
            onClick={() => setShowTypeSelector(!showTypeSelector)}
            className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 text-sm hover:border-gray-300 transition-colors bg-white"
          >
            <span className="flex items-center gap-2">
              <span>{selectedOption.icon}</span>
              <span className="font-medium text-gray-800">
                {selectedOption.label}
              </span>
              <span className="text-gray-400 text-xs hidden sm:inline">
                — {selectedOption.description}
              </span>
            </span>
            <span className="text-gray-400 text-xs">
              {showTypeSelector ? "▲" : "▼"}
            </span>
          </button>

          {/* Dropdown */}
          {showTypeSelector && (
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
              {CONTRACT_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setContractType(option.value);
                    setShowTypeSelector(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${
                    contractType === option.value ? "bg-gray-50" : ""
                  }`}
                >
                  <span className="text-base">{option.icon}</span>
                  <div>
                    <p
                      className={`font-medium ${contractType === option.value ? "text-black" : "text-gray-700"}`}
                    >
                      {option.label}
                    </p>
                    <p className="text-xs text-gray-400">
                      {option.description}
                    </p>
                  </div>
                  {contractType === option.value && (
                    <span className="ml-auto text-black text-xs">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Drop Zone ── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-200
          ${
            isDragging
              ? "border-blue-400 bg-blue-50"
              : status === "done"
                ? "border-green-300 bg-green-50"
                : status === "error"
                  ? "border-red-300 bg-red-50"
                  : "border-gray-300 bg-white hover:border-gray-400"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.docx,.doc"
          onChange={handleFileInput}
          className="hidden"
          id="file-input"
          disabled={status === "uploading"}
        />

        <div className="text-3xl mb-2">
          {status === "uploading"
            ? "⏳"
            : status === "done"
              ? "✅"
              : status === "error"
                ? "❌"
                : selectedOption.icon}
        </div>

        {status === "idle" && (
          <>
            <p className="text-gray-600 font-medium mb-1">
              Upload your {selectedOption.label.toLowerCase()}
            </p>
            <p className="text-gray-400 text-xs mb-4">
              PDF, DOCX, TXT · Max {MAX_FILE_SIZE_MB}MB · Drag & drop or click
            </p>
            <label
              htmlFor="file-input"
              className="cursor-pointer inline-block px-5 py-2.5 bg-black text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
            >
              Choose file
            </label>
          </>
        )}

        {status === "uploading" && (
          <div className="space-y-3">
            <p className="text-gray-700 text-sm font-medium">{fileName}</p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-gray-400 text-xs">
              Analyzing {selectedOption.label.toLowerCase()}... please wait
            </p>
            <button
              onClick={handleCancel}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        )}

        {status === "done" && (
          <div className="space-y-1">
            <p className="text-green-700 text-sm font-medium">{fileName}</p>
            <p className="text-green-600 text-xs">Upload complete</p>
            <button
              onClick={handleRetry}
              className="mt-2 text-xs text-gray-400 underline hover:text-gray-600"
            >
              Upload another file
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <p className="text-red-600 text-sm">
              {errorMessage || "Upload failed. Please try again."}
            </p>
            <button
              onClick={handleRetry}
              className="inline-block px-4 py-2 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* ── Risk Banner ── */}
      {status === "done" && uploadResult && riskConfig && (
        <div
          className={`rounded-xl border p-4 ${riskConfig.bg} ${riskConfig.border}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{riskConfig.emoji}</span>
            <span className={`font-semibold text-sm ${riskConfig.text}`}>
              Overall Risk: {riskConfig.label}
            </span>
            <span className="ml-auto text-xs text-gray-400">
              {uploadResult.chunkCount} sections analyzed
            </span>
          </div>

          {/* Contract type badge */}
          <div className="mb-2">
            <span className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">
              {
                CONTRACT_TYPE_OPTIONS.find(
                  (o) => o.value === uploadResult.contractType,
                )?.icon
              }{" "}
              {
                CONTRACT_TYPE_OPTIONS.find(
                  (o) => o.value === uploadResult.contractType,
                )?.label
              }
            </span>
          </div>

          {uploadResult.highRiskSections.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-red-600 mb-1">
                🔴 Requires Immediate Review
              </p>
              <ul className="space-y-0.5">
                {uploadResult.highRiskSections.map((section, i) => (
                  <li
                    key={i}
                    className="text-xs text-red-700 pl-2 border-l-2 border-red-300"
                  >
                    {section}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uploadResult.mediumRiskSections.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-yellow-600 mb-1">
                🟡 Review Recommended
              </p>
              <ul className="space-y-0.5">
                {uploadResult.mediumRiskSections.map((section, i) => (
                  <li
                    key={i}
                    className="text-xs text-yellow-700 pl-2 border-l-2 border-yellow-300"
                  >
                    {section}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uploadResult.overallRisk === "low" && (
            <p className="text-xs text-green-600 mt-1">
              No high-risk clauses detected. Use the chat to review specific
              terms.
            </p>
          )}

          <p className="text-xs text-gray-400 mt-2">
            Language:{" "}
            {uploadResult.detectedLanguage === "ko"
              ? "Korean"
              : uploadResult.detectedLanguage === "en"
                ? "English"
                : "Korean / English Mixed"}
          </p>
        </div>
      )}
    </div>
  );
}
