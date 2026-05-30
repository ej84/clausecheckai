// app/api/upload/route.ts
// Contract-specialized file upload, chunking, embedding, and storage

import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";
import mammoth from "mammoth";
import { chunkText } from "@/lib/chunker";
import { embedTexts } from "@/lib/embeddings";
import { index } from "@/lib/pinecone";
import supabaseAdmin from "@/lib/supabaseAdmin";
import type { RecordMetadata } from "@pinecone-database/pinecone";
import { type ContractType, getHighRiskKeywords, getMediumRiskKeywords } from "@/lib/contractTypes";

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const PINECONE_BATCH_SIZE = 50;

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
};

// ─────────────────────────────────────────
// DOCX text extraction
// ─────────────────────────────────────────
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (e) {
    throw new Error(`DOCX parsing failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─────────────────────────────────────────
// File type router
// ─────────────────────────────────────────
async function extractTextFromFile(file: File, buffer: Buffer): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    return text;
  }

  if (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    file.type.includes("wordprocessingml") ||
    file.type === "application/msword"
  ) {
    return await extractDocxText(buffer);
  }

  // TXT — strip BOM
  return buffer.toString("utf-8").replace(/^\uFEFF/, "");
}

// ─────────────────────────────────────────
// Pinecone batch upsert
// Uses { records: batch } format required by current SDK
// ─────────────────────────────────────────
async function upsertInBatches(
  vectors: Array<{
    id: string;
    values: number[];
    metadata: RecordMetadata;
  }>
): Promise<void> {
  for (let i = 0; i < vectors.length; i += PINECONE_BATCH_SIZE) {
    const batch = vectors.slice(i, i + PINECONE_BATCH_SIZE);
    await index.upsert({ records: batch });
  }
}

function summarizeRiskTyped(
  chunks: import("@/lib/chunker").TextChunk[],
  highKeywords: string[],
  medKeywords: string[]
): { highRiskSections: string[]; mediumRiskSections: string[]; overallRisk: "high" | "medium" | "low" } {
  const highRiskSections: string[] = [];
  const mediumRiskSections: string[] = [];
 
  for (const chunk of chunks) {
    const lower = chunk.text.toLowerCase();
    const label = chunk.sectionTitle || chunk.sectionNumber || `Chunk ${chunk.index + 1}`;
 
    const hasHigh = highKeywords.some((kw) => lower.includes(kw.toLowerCase()));
    const hasMedium = medKeywords.some((kw) => lower.includes(kw.toLowerCase()));
 
    if (hasHigh) highRiskSections.push(label);
    else if (hasMedium) mediumRiskSections.push(label);
  }
 
  const overallRisk =
    highRiskSections.length > 0 ? "high" :
    mediumRiskSections.length > 0 ? "medium" : "low";
 
  return { highRiskSections, mediumRiskSections, overallRisk };
}

// ─────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Auth check
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Parse form data
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  // 3. File size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File size must be under ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }

  // 4. File type check (MIME + extension)
  const name = file.name.toLowerCase();
  const isAllowedMime = Object.keys(ALLOWED_MIME_TYPES).includes(file.type);
  const isAllowedExt =
    name.endsWith(".pdf") ||
    name.endsWith(".txt") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc");

  if (!isAllowedMime && !isAllowedExt) {
    return NextResponse.json(
      { error: "Only PDF, TXT, and DOCX files are allowed." },
      { status: 400 }
    );
  }

  const contractType = (formData?.get("contractType") as ContractType | null) ?? "general";

  // 5. Extract text
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";

  try {
    text = await extractTextFromFile(file, buffer);
  } catch (e) {
    console.error("Text extraction error:", e);
    return NextResponse.json(
      {
        error: `Failed to parse file: ${
          e instanceof Error ? e.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }

  if (!text?.trim()) {
    return NextResponse.json(
      {
        error:
          "No text could be extracted. Scanned image PDFs are not supported.",
      },
      { status: 422 }
    );
  }

  // 6. Chunk + pre-analyze risk
  const chunks = chunkText(text);

  if (chunks.length === 0) {
    return NextResponse.json(
      { error: "Failed to analyze document." },
      { status: 422 }
    );
  }

const highKeywords = getHighRiskKeywords(contractType);
const medKeywords = getMediumRiskKeywords(contractType);
const { highRiskSections, mediumRiskSections, overallRisk } = summarizeRiskTyped(chunks, highKeywords, medKeywords);

  // Detect dominant language (majority vote)
  const langCounts: Record<string, number> = { ko: 0, en: 0, mixed: 0 };
  for (const chunk of chunks) {
    langCounts[chunk.language] = (langCounts[chunk.language] ?? 0) + 1;
  }
  const detectedLanguage = Object.entries(langCounts).sort(
    (a, b) => b[1] - a[1]
  )[0][0];

  const docId = crypto.randomUUID();

  // 7. Generate embeddings + upsert to Pinecone
  try {
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await embedTexts(chunkTexts);

    const vectors = chunks.map((chunk, i) => ({
      id: `${docId}#${chunk.index}`,
      values: embeddings[i],
      metadata: {
        docId,
        userId: user.id,
        fileName: file.name,
        chunkIndex: chunk.index,
        text: chunk.text,
        sectionTitle: chunk.sectionTitle ?? "",
        sectionNumber: chunk.sectionNumber ?? "",
        language: chunk.language,
        riskHints: chunk.riskHints,
      } as RecordMetadata,
    }));

    await upsertInBatches(vectors);
    console.log(`Pinecone upsert complete: ${vectors.length} vectors, docId: ${docId}`);
  } catch (e) {
    console.error("Embedding/Pinecone error:", e);
    return NextResponse.json(
      { error: "Failed to save embeddings." },
      { status: 500 }
    );
  }

  // 8. Save document metadata to Supabase
  try {
    const { error } = await supabaseAdmin.from("documents").insert({
      id: docId,
      user_id: user.id,
      file_name: file.name,
      file_type: name.split(".").pop() ?? "unknown",
      char_count: text.length,
      chunk_count: chunks.length,
      overall_risk: overallRisk,
      high_risk_sections: highRiskSections,
      medium_risk_sections: mediumRiskSections,
      detected_language: detectedLanguage,
      contract_type: contractType,
    });

    if (error) throw error;
    console.log(`Supabase insert complete: docId ${docId}, risk: ${overallRisk}`);
  } catch (e) {
    console.error("Supabase error:", e);
    return NextResponse.json(
      { error: "Failed to save document metadata.", docId },
      { status: 500 }
    );
  }

  // 9. Success response
  return NextResponse.json({
    docId,
    charCount: text.length,
    chunkCount: chunks.length,
    overallRisk,
    highRiskSections,
    mediumRiskSections,
    detectedLanguage,
    contractType,
  });
}