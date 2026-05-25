"use client";

// components/ChatWindow.tsx

import { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  questionType?: string;
  hasHighRisk?: boolean;
}

interface ChatWindowProps {
  docId: string;
  overallRisk?: "high" | "medium" | "low" | "unknown";
  fileName?: string;
}

// ─────────────────────────────────────────
// Suggested questions by risk level
// ─────────────────────────────────────────
const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  high: [
    "Identify all high-risk clauses in this contract",
    "Are there any unlimited liability or rights waiver clauses?",
    "Is there an auto-renewal clause? What are the terms?",
    "What are the termination conditions?",
  ],
  medium: [
    "Summarize the key clauses of this contract",
    "Are there any arbitration or jurisdiction clauses?",
    "What does the confidentiality clause say?",
    "What are the liability limitation terms?",
  ],
  low: [
    "Give me an overall summary of this contract",
    "Which party does this contract favor?",
    "Are there any clauses I should negotiate?",
    "What are the main obligations of each party?",
  ],
  unknown: [
    "Analyze all risk clauses in this contract",
    "Summarize the key terms of this contract",
    "Which party does this contract favor?",
    "Are there any unusual or concerning clauses?",
  ],
};

// ─────────────────────────────────────────
// Render assistant message with risk highlighting
// ─────────────────────────────────────────
function RiskHighlightedText({ text }: { text: string }) {
  if (!text) return null;

  // Split by lines and apply risk-level styling
  const lines = text.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const isHighRisk = line.includes("🔴");
        const isMediumRisk = line.includes("🟡");
        const isLowRisk = line.includes("🟢");
        const isBold = line.startsWith("**") && line.includes("**");

        let lineClass = "text-sm text-gray-800";
        let bgClass = "";

        if (isHighRisk) {
          lineClass = "text-sm text-red-700 font-medium";
          bgClass = "bg-red-50 rounded px-2 py-0.5";
        } else if (isMediumRisk) {
          lineClass = "text-sm text-yellow-700 font-medium";
          bgClass = "bg-yellow-50 rounded px-2 py-0.5";
        } else if (isLowRisk) {
          lineClass = "text-sm text-green-700";
          bgClass = "bg-green-50 rounded px-2 py-0.5";
        }

        // Render bold markers (**text**)
        const rendered = line
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/^#{1,3}\s/, ""); // strip markdown headings

        return (
          <p
            key={i}
            className={`${lineClass} ${bgClass} ${isBold && !isHighRisk && !isMediumRisk && !isLowRisk ? "font-semibold" : ""} whitespace-pre-wrap leading-relaxed`}
            dangerouslySetInnerHTML={{ __html: rendered || "&nbsp;" }}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────
// Main component
// ─────────────────────────────────────────
export default function ChatWindow({
  docId,
  overallRisk = "unknown",
  fileName,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [responseMetadata, setResponseMetadata] = useState<{
    questionType?: string;
    hasHighRisk?: boolean;
  }>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Submit handler ───────────────────────
  const handleSubmit = async (questionOverride?: string) => {
    const question = (questionOverride ?? input).trim();
    if (!question || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setIsLoading(true);

    // Placeholder for streaming assistant reply
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, docId }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
      }

      // Read response metadata from headers
      const questionType = res.headers.get("X-Question-Type") ?? undefined;
      const hasHighRisk = res.headers.get("X-Has-High-Risk") === "true";
      setResponseMetadata({ questionType, hasHighRisk });

      // Stream response into last message
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + chunk,
            questionType,
            hasHighRisk,
          };
          return updated;
        });
      }
    } catch (e) {
      console.error("Chat error:", e);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${e instanceof Error ? e.message : "Something went wrong. Please try again."}`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestedQuestions =
    SUGGESTED_QUESTIONS[overallRisk] ?? SUGGESTED_QUESTIONS.unknown;

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="flex flex-col h-160 border border-gray-200 rounded-xl overflow-hidden mt-6">
      {/* Chat header */}
      <div className="border-b border-gray-100 px-4 py-2.5 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-sm">📄</span>
          <span className="text-sm font-medium text-gray-700 truncate max-w-60">
            {fileName ?? "Contract Analysis"}
          </span>
        </div>
        {responseMetadata.hasHighRisk && (
          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
            🔴 High Risk Detected
          </span>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
        {/* Empty state with suggested questions */}
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-center text-gray-400 text-sm mt-4">
              Contract uploaded. Ask anything about this document.
            </p>
            <div className="space-y-2">
              <p className="text-xs text-gray-400 text-center">
                Suggested questions
              </p>
              <div className="grid grid-cols-1 gap-2">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSubmit(q)}
                    disabled={isLoading}
                    className="text-left text-xs text-gray-600 border border-gray-200 rounded-xl px-3 py-2 hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {/* Assistant avatar */}
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs mr-2 mt-1 shrink-0">
                ⚖️
              </div>
            )}

            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                msg.role === "user"
                  ? "bg-black text-white text-sm rounded-br-sm"
                  : `rounded-bl-sm border ${
                      msg.hasHighRisk
                        ? "border-red-200 bg-red-50"
                        : "border-gray-100 bg-gray-50"
                    }`
              }`}
            >
              {msg.role === "user" ? (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <>
                  <RiskHighlightedText text={msg.content} />
                  {/* Streaming cursor */}
                  {isLoading && i === messages.length - 1 && !msg.content && (
                    <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" />
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 p-3 flex gap-2 items-end bg-white">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this contract... (Enter to send, Shift+Enter for new line)"
          rows={1}
          disabled={isLoading}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:opacity-50"
        />
        <button
          onClick={() => handleSubmit()}
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 bg-black text-white text-sm rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors"
        >
          {isLoading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
