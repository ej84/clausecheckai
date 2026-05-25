// app/api/chat/route.ts
// Contract-specialized RAG chat endpoint

import { NextRequest, NextResponse } from "next/server";
import { embedTexts } from "@/lib/embeddings";
import { index } from "@/lib/pinecone";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ─────────────────────────────────────────
// Question type classification
// ─────────────────────────────────────────
type QuestionType =
  | "full_risk_scan"   // "find all risky clauses", "full analysis"
  | "section_lookup"   // "what does article 3 say", "explain the indemnification clause"
  | "comparison"       // "does this favor party A or party B"
  | "specific_risk"    // "is there an auto-renewal clause?", "what are the penalty terms?"
  | "general";         // everything else

function classifyQuestion(question: string): QuestionType {
  const q = question.toLowerCase();

  const fullScanKw = ["전체", "전부", "모든", "다 찾아", "요약해", "분석해줘", "overall", "all clause", "full review", "summarize", "scan"];
  if (fullScanKw.some((kw) => q.includes(kw))) return "full_risk_scan";

  const sectionKw = ["조", "항", "절", "article", "section", "clause", "조항 설명", "뭔 내용", "what does", "explain"];
  if (sectionKw.some((kw) => q.includes(kw))) return "section_lookup";

  const comparisonKw = ["유리", "불리", "갑을", "favor", "unfair", "biased", "one-sided"];
  if (comparisonKw.some((kw) => q.includes(kw))) return "comparison";

  const specificRiskKw = ["위약금", "자동갱신", "해지", "경업금지", "비밀유지", "손해배상", "책임",
    "penalty", "auto-renew", "termination", "non-compete", "nda", "liability", "indemnif"];
  if (specificRiskKw.some((kw) => q.includes(kw))) return "specific_risk";

  return "general";
}

// ─────────────────────────────────────────
// topK and system prompt per question type
// ─────────────────────────────────────────
function getTopK(type: QuestionType): number {
  switch (type) {
    case "full_risk_scan": return 15;
    case "comparison":     return 12;
    case "specific_risk":  return 6;
    case "section_lookup": return 4;
    default:               return 5;
  }
}

function buildSystemPrompt(type: QuestionType, language: "ko" | "en" | "auto"): string {
  const isKo = language === "ko";

  const base = isKo
    ? `You are a contract analysis expert. Answer questions accurately based on the uploaded contract content.

Rules:
- Never fabricate or infer information not present in the contract.
- Always use these risk indicators:
  🔴 HIGH RISK — Requires immediate attention (unlimited liability, rights waiver, auto-renewal, non-compete, etc.)
  🟡 MEDIUM RISK — Needs careful review (liability limitation, arbitration, NDA, etc.)
  🟢 LOW RISK — Standard clause
- Always reference section/article numbers when available.
- The contract is in Korean — respond in Korean.
- This is contract content analysis, not legal advice.`
    : `You are a contract analysis expert. Answer questions accurately based on the uploaded contract content.

Rules:
- Never fabricate or infer information not present in the contract.
- Always use these risk indicators:
  🔴 HIGH RISK — Requires immediate attention (unlimited liability, rights waiver, auto-renewal, non-compete, etc.)
  🟡 MEDIUM RISK — Needs careful review (liability limitation, arbitration, NDA, etc.)
  🟢 LOW RISK — Standard clause
- Always reference section/article numbers when available.
- This is contract content analysis, not legal advice.`;

  const typeInstructions: Record<QuestionType, string> = {
    full_risk_scan:
      `\n\nOutput format:\n1. **Overall Risk Summary** (count of 🔴/🟡/🟢)\n2. **🔴 HIGH RISK Clauses** (issue per clause)\n3. **🟡 MEDIUM RISK Clauses** (caution per clause)\n4. **💡 Negotiation Recommendations**`,

    section_lookup:
      `\n\nExplain the clause content, indicate its risk level, and mention any concerns.`,

    comparison:
      `\n\nAnalyze clauses from both Party A (provider/employer) and Party B (recipient/employee) perspectives. List favorable and unfavorable clauses for each party separately.`,

    specific_risk:
      `\n\nFind clauses related to this risk factor. If none exist, clearly state "No such clause found."`,

    general:
      `\n\nAnswer based on the contract content provided.`,
  };

  return base + typeInstructions[type];
}

// ─────────────────────────────────────────
// Build context blocks from Pinecone metadata
// ─────────────────────────────────────────
interface ChunkMetadata {
  text: string;
  sectionTitle?: string;
  sectionNumber?: string;
  riskHints?: string[];
  language?: string;
  [key: string]: unknown;
}

function buildContext(matches: Array<{ metadata?: Record<string, unknown> }>): {
  contextText: string;
  detectedLanguage: "ko" | "en" | "auto";
  hasHighRisk: boolean;
} {
  let koCount = 0;
  let enCount = 0;
  let hasHighRisk = false;

  const blocks = matches
    .map((match) => {
      const meta = match.metadata as ChunkMetadata | undefined;
      if (!meta?.text) return null;

      const lang = meta.language as string | undefined;
      if (lang === "ko") koCount++;
      else if (lang === "en") enCount++;

      const riskHints = meta.riskHints as string[] | undefined;
      if (riskHints?.some((h) => h.startsWith("[HIGH]"))) hasHighRisk = true;

      const header = meta.sectionTitle
        ? `[${meta.sectionTitle}]`
        : meta.sectionNumber
        ? `[Section ${meta.sectionNumber}]`
        : "";

      const riskLine =
        riskHints && riskHints.length > 0
          ? `⚠️ Risk hints: ${riskHints.join(", ")}\n`
          : "";

      return `${header}\n${riskLine}${meta.text}`;
    })
    .filter(Boolean) as string[];

  const detectedLanguage: "ko" | "en" | "auto" =
    koCount > enCount ? "ko" : enCount > 0 ? "en" : "auto";

  return {
    contextText: blocks.join("\n\n---\n\n"),
    detectedLanguage,
    hasHighRisk,
  };
}

// ─────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !body.question || !body.docId) {
    return NextResponse.json(
      { error: "question and docId are required." },
      { status: 400 }
    );
  }

  const { question, docId } = body as { question: string; docId: string };
  const questionType = classifyQuestion(question);
  const topK = getTopK(questionType);

  // 1. Embed question
  let questionEmbedding: number[];
  try {
    const embeddings = await embedTexts([question]);
    questionEmbedding = embeddings[0];
  } catch (e) {
    console.error("Embedding error:", e);
    return NextResponse.json({ error: "Failed to embed question." }, { status: 500 });
  }

  // 2. Query Pinecone
  let contextText: string;
  let detectedLanguage: "ko" | "en" | "auto";
  let hasHighRisk: boolean;

  try {
    const results = await index.query({
      vector: questionEmbedding,
      topK,
      includeMetadata: true,
      filter: { docId },
    });

    if (!results.matches || results.matches.length === 0) {
      return NextResponse.json(
        { error: "No relevant content found in document." },
        { status: 404 }
      );
    }

    ({ contextText, detectedLanguage, hasHighRisk } = buildContext(results.matches));
  } catch (e) {
    console.error("Pinecone query error:", e);
    return NextResponse.json({ error: "Failed to search document." }, { status: 500 });
  }

  // 3. Build system prompt
  const systemPrompt = buildSystemPrompt(questionType, detectedLanguage);

  const riskWarning =
    questionType === "full_risk_scan" && hasHighRisk
      ? "⚠️ Pre-analysis detected HIGH RISK keywords. Please review the following carefully.\n\n"
      : "";

  const userMessage = `${riskWarning}Answer the question based on the contract content below.

Contract content:
${contextText}

Question: ${question}`;

  // 4. Claude streaming response
  try {
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: questionType === "full_risk_scan" ? 3000 : 1500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
        }
        controller.close();
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Question-Type": questionType,
        "X-Has-High-Risk": hasHighRisk ? "true" : "false",
        "X-Detected-Language": detectedLanguage,
      },
    });
  } catch (e) {
    console.error("Claude API error:", e);
    return NextResponse.json({ error: "Failed to generate response." }, { status: 500 });
  }
}