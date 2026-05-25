// lib/pinecone.ts
import { Pinecone, type Index } from "@pinecone-database/pinecone";

// ─────────────────────────────────────────
// 환경변수 검증 (서버 시작 시점에 빠르게 실패)
// ─────────────────────────────────────────
const apiKey = process.env.PINECONE_API_KEY;
const indexName = process.env.PINECONE_INDEX_NAME;

if (!apiKey) throw new Error("PINECONE_API_KEY is not set.");
if (!indexName) throw new Error("PINECONE_INDEX_NAME is not set.");

// Assert as string — TypeScript doesn't narrow through throw checks
const _apiKey = apiKey as string;
const _indexName = indexName as string;

// ─────────────────────────────────────────
// 싱글턴 (Next.js dev HMR 대응)
// ─────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var _pineconeClient: Pinecone | undefined;
}

const pinecone: Pinecone =
  globalThis._pineconeClient ??
  (() => {
    const client = new Pinecone({ apiKey: _apiKey });
    if (process.env.NODE_ENV !== "production") {
      globalThis._pineconeClient = client;
    }
    return client;
  })();

// ─────────────────────────────────────────
// Default index (backward compatible)
// ─────────────────────────────────────────
export const index: Index = pinecone.index(_indexName);

// ─────────────────────────────────────────
// Per-user namespaced index
// Usage in upload/route.ts and chat/route.ts:
//   import { getNamespacedIndex } from "@/lib/pinecone";
//   const nsIndex = getNamespacedIndex(user.id);
//   await nsIndex.upsert(vectors);
//   await nsIndex.query({ ... });
// ─────────────────────────────────────────
export function getNamespacedIndex(userId: string): Index {
  return pinecone.index(_indexName).namespace(userId);
}