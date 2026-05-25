// lib/embeddings.ts
// Contract-specialized embedding generator with batching, preprocessing, and retry

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Safe batch limit — official max is 2048 inputs but total token limit also applies
const OPENAI_BATCH_LIMIT = 100;

const EMBEDDING_MODEL =
  (process.env.OPENAI_EMBEDDING_MODEL as string | undefined) ??
  "text-embedding-3-small";

// ─────────────────────────────────────────
// Contract text preprocessing
// ─────────────────────────────────────────
function preprocessContractText(text: string): string {
  return (
    text
      // Restore hyphenated line breaks from PDF extraction: "agree-\nment" → "agreement"
      .replace(/-\n([a-z가-힣])/g, "$1")
      // Replace single newlines with spaces (preserve double newlines for paragraph breaks)
      .replace(/(?<!\n)\n(?!\n)/g, " ")
      // Remove page number artifacts: "- 3 -", "3", "Page 3", etc.
      .replace(/^\s*[-–—]?\s*\d+\s*[-–—]?\s*$/gm, "")
      .replace(/^\s*page\s+\d+\s*$/gim, "")
      // Collapse multiple spaces
      .replace(/ {2,}/g, " ")
      .trim()
  );
}

// ─────────────────────────────────────────
// Single batch embedding with retry
// ─────────────────────────────────────────
async function embedBatch(texts: string[], retries = 3): Promise<number[][]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });

      // Sort by index to guarantee order
      return response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
    } catch (e) {
      lastError = e;

      const isRateLimit = e instanceof OpenAI.APIError && e.status === 429;
      const isServerError = e instanceof OpenAI.APIError && e.status !== undefined && e.status >= 500;

      if (isRateLimit || isServerError) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(
          `Embedding API error (attempt ${attempt}/${retries}), retrying in ${delay}ms...`,
          e instanceof OpenAI.APIError ? `status: ${e.status}` : e
        );
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }

      // Non-retryable errors (invalid key, bad input, etc.) — throw immediately
      throw new Error(
        `Embedding failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  throw new Error(
    `Embedding failed after ${retries} retries: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

// ─────────────────────────────────────────
// Main export — with batching and preprocessing
// ─────────────────────────────────────────
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Filter empty texts while preserving original index mapping
  const validEntries: Array<{ originalIndex: number; text: string }> = [];
  for (let i = 0; i < texts.length; i++) {
    const cleaned = preprocessContractText(texts[i] ?? "");
    if (cleaned.length > 0) {
      validEntries.push({ originalIndex: i, text: cleaned });
    } else {
      console.warn(`embedTexts: skipping empty text at index ${i}`);
    }
  }

  if (validEntries.length === 0) {
    throw new Error("No valid text to embed.");
  }

  // Process in batches
  const results: Array<{ originalIndex: number; embedding: number[] }> = [];

  for (let i = 0; i < validEntries.length; i += OPENAI_BATCH_LIMIT) {
    const batch = validEntries.slice(i, i + OPENAI_BATCH_LIMIT);
    const batchTexts = batch.map((e) => e.text);

    console.log(
      `Embedding batch: ${i + 1}–${Math.min(i + OPENAI_BATCH_LIMIT, validEntries.length)} / ${validEntries.length}`
    );

    const embeddings = await embedBatch(batchTexts);

    for (let j = 0; j < batch.length; j++) {
      results.push({
        originalIndex: batch[j].originalIndex,
        embedding: embeddings[j],
      });
    }
  }

  // Restore original index order (empty slots filled with empty arrays)
  const output: number[][] = new Array(texts.length).fill([]);
  for (const { originalIndex, embedding } of results) {
    output[originalIndex] = embedding;
  }

  return output;
}

// ─────────────────────────────────────────
// Single query embedding (used in chat/route.ts)
// ─────────────────────────────────────────
export async function embedQuery(query: string): Promise<number[]> {
  const cleaned = preprocessContractText(query);
  if (!cleaned) throw new Error("Query is empty after preprocessing.");

  const [embedding] = await embedBatch([cleaned]);
  return embedding;
}