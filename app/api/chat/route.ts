// app/api/chat/route.ts — v2
// Key change: buildSystemPrompt now accepts contractType and injects per-type context

import { NextRequest, NextResponse } from "next/server";
import { embedTexts } from "@/lib/embeddings";
import { index } from "@/lib/pinecone";
import Anthropic from "@anthropic-ai/sdk";
import { type ContractType, getTypePromptContext } from "@/lib/contractTypes";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ─────────────────────────────────────────
// Question type classification
// ─────────────────────────────────────────
type QuestionType = "full_risk_scan" | "section_lookup" | "comparison" | "specific_risk" | "general";

function classifyQuestion(question: string): QuestionType {
  const q = question.toLowerCase();
  if (["전체", "전부", "모든", "다 찾아", "요약해", "분석해줘", "overall", "all clause", "full review", "summarize", "scan"].some(kw => q.includes(kw))) return "full_risk_scan";
  if (["조", "항", "절", "article", "section", "clause", "조항 설명", "뭔 내용", "what does", "explain"].some(kw => q.includes(kw))) return "section_lookup";
  if (["유리", "불리", "갑을", "favor", "unfair", "biased", "one-sided"].some(kw => q.includes(kw))) return "comparison";
  if (["위약금", "자동갱신", "해지", "경업금지", "비밀유지", "손해배상", "책임", "penalty", "auto-renew", "termination", "non-compete", "nda", "liability", "indemnif"].some(kw => q.includes(kw))) return "specific_risk";
  return "general";
}

function getTopK(type: QuestionType): number {
  switch (type) {
    case "full_risk_scan": return 15;
    case "comparison": return 12;
    case "specific_risk": return 6;
    case "section_lookup": return 4;
    default: return 5;
  }
}

// ─────────────────────────────────────────
// System prompt — now contract-type aware
// ─────────────────────────────────────────
function buildSystemPrompt(
  type: QuestionType,
  language: "ko" | "en" | "auto",
  contractType: ContractType
): string {
  const isKo = language === "ko";
  const typeContext = getTypePromptContext(contractType);

  const base = `You are a contract analysis expert. Answer questions accurately based on the uploaded contract content.

${typeContext}

Rules:
- Never fabricate or infer information not present in the contract.
- Always use these risk indicators:
  🔴 HIGH RISK — Requires immediate attention
  🟡 MEDIUM RISK — Needs careful review
  🟢 LOW RISK — Standard clause
- Always reference section/article numbers when available.
- This is contract content analysis, not legal advice.${isKo ? "\n- The contract is in Korean — respond in Korean." : ""}`;

  const typeInstructions: Record<QuestionType, string> = {
    full_risk_scan: `\n\nOutput format:\n1. **Overall Risk Summary** (count of 🔴/🟡/🟢)\n2. **🔴 HIGH RISK Clauses** (issue per clause)\n3. **🟡 MEDIUM RISK Clauses** (caution per clause)\n4. **💡 Negotiation Recommendations**`,
    section_lookup: `\n\nExplain the clause content, indicate its risk level, and mention any concerns.`,
    comparison: `\n\nAnalyze clauses from both Party A (provider/employer) and Party B (recipient/employee) perspectives.`,
    specific_risk: `\n\nFind clauses related to this risk factor. If none exist, clearly state "No such clause found."`,
    general: `\n\nAnswer based on the contract content provided.`,
  };

  return base + typeInstructions[type];
}

// ─────────────────────────────────────────
// Build context from Pinecone metadata
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
  let koCount = 0, enCount = 0, hasHighRisk = false;

  const blocks = matches.map((match) => {
    const meta = match.metadata as ChunkMetadata | undefined;
    if (!meta?.text) return null;
    if (meta.language === "ko") koCount++;
    else if (meta.language === "en") enCount++;
    const riskHints = meta.riskHints as string[] | undefined;
    if (riskHints?.some(h => h.startsWith("[HIGH]"))) hasHighRisk = true;
    const header = meta.sectionTitle ? `[${meta.sectionTitle}]` : meta.sectionNumber ? `[Section ${meta.sectionNumber}]` : "";
    const riskLine = riskHints?.length ? `⚠️ Risk hints: ${riskHints.join(", ")}\n` : "";
    return `${header}\n${riskLine}${meta.text}`;
  }).filter(Boolean) as string[];

  return {
    contextText: blocks.join("\n\n---\n\n"),
    detectedLanguage: koCount > enCount ? "ko" : enCount > 0 ? "en" : "auto",
    hasHighRisk,
  };
}

// ─────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.question || !body?.docId) {
    return NextResponse.json({ error: "question and docId are required." }, { status: 400 });
  }

  const { question, docId, contractType = "general" } = body as {
    question: string;
    docId: string;
    contractType: ContractType;
  };

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
  let contextText: string, detectedLanguage: "ko" | "en" | "auto", hasHighRisk: boolean;
  try {
    const results = await index.query({ vector: questionEmbedding, topK, includeMetadata: true, filter: { docId } });
    if (!results.matches?.length) {
      return NextResponse.json({ error: "No relevant content found in document." }, { status: 404 });
    }
    ({ contextText, detectedLanguage, hasHighRisk } = buildContext(results.matches));
  } catch (e) {
    console.error("Pinecone query error:", e);
    return NextResponse.json({ error: "Failed to search document." }, { status: 500 });
  }

  // 3. Build system prompt with contract type context
  const systemPrompt = buildSystemPrompt(questionType, detectedLanguage, contractType);

  const riskWarning = questionType === "full_risk_scan" && hasHighRisk
    ? "⚠️ Pre-analysis detected HIGH RISK keywords. Please review the following carefully.\n\n"
    : "";

  const userMessage = `${riskWarning}Answer the question based on the contract content below.

Contract content:
${contextText}

Question: ${question}`;

  // 4. Claude streaming
  try {
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: questionType === "full_risk_scan" ? 3000 : 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
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
        "X-Contract-Type": contractType,
      },
    });
  } catch (e) {
    console.error("Claude API error:", e);
    return NextResponse.json({ error: "Failed to generate response." }, { status: 500 });
  }
}