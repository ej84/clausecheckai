// lib/chunker.ts
// Contract-specialized chunker for RAG-based contract analysis

export type RiskLevel = "high" | "medium" | "low" | "unknown";

export interface TextChunk {
  text: string;
  index: number;
  charStart: number;
  charEnd: number;
  // --- Contract-specific metadata ---
  sectionTitle: string | null;   // e.g. "Article 3. Indemnification" or "제3조 (손해배상)"
  sectionNumber: string | null;  // e.g. "3", "3.2", "Article 3"
  language: "ko" | "en" | "mixed";
  riskHints: string[];           // pre-detected risk keyword matches
}

// ─────────────────────────────────────────
// Risk keyword dictionary (English + Korean)
// ─────────────────────────────────────────
const RISK_KEYWORDS_HIGH = [
  // English
  "indemnif", "unlimited liability", "sole discretion", "irrevocable",
  "perpetual", "waive", "waiver", "forfeit", "penalty", "liquidated damages",
  "automatic renewal", "unilateral", "terminate immediately", "without notice",
  "non-compete", "non-solicitation", "intellectual property assignment",
  "assign all rights", "work for hire",
  // Korean
  "무한책임", "단독재량", "취소불가", "영구적", "권리포기", "위약금",
  "자동갱신", "일방적", "즉시해지", "사전통지없이", "경업금지",
  "지식재산권 양도", "모든 권리 양도",
];

const RISK_KEYWORDS_MEDIUM = [
  // English
  "notwithstanding", "at our discretion", "may modify", "subject to change",
  "arbitration", "governing law", "jurisdiction", "force majeure",
  "limitation of liability", "as-is", "no warranty", "disclaimer",
  "confidential", "non-disclosure",
  // Korean
  "재량에 따라", "변경될 수 있", "중재", "준거법", "관할", "불가항력",
  "책임제한", "보증없음", "면책", "비밀유지", "기밀",
];

// ─────────────────────────────────────────
// Section pattern detection (English + Korean)
// ─────────────────────────────────────────
// English: Article 1, Section 2.3, 1. Title, 1.1 Sub-title
const EN_SECTION_PATTERN =
  /^(?:article|section|clause|exhibit|schedule|addendum)[\s.]*(\d+(?:\.\d+)*)|^(\d+(?:\.\d+)*)[\s.]+[A-Z][^\n]{2,60}/im;

// Korean: 제1조, 제1조의2, 제1장, 1. 제목
const KO_SECTION_PATTERN =
  /^(?:제\s*\d+\s*(?:조|장|절|항|호)(?:의\d+)?)|^(?:\d+\.\s+[가-힣])/m;

// Suppress unused variable warnings — patterns kept for reference
void EN_SECTION_PATTERN;
void KO_SECTION_PATTERN;

function detectSectionTitle(text: string): { title: string | null; number: string | null } {
  const firstLine = text.split("\n")[0].trim();

  // Korean section heading
  const koMatch = firstLine.match(/^(제\s*(\d+)\s*(?:조|장|절|항|호)(?:의\d+)?(?:\s*\(.*?\))?)/);
  if (koMatch) {
    return { title: koMatch[1].trim(), number: koMatch[2] };
  }

  // English section heading
  const enMatch = firstLine.match(
    /^(?:(article|section|clause)\s+(\d+(?:\.\d+)*)(?:\s*[:\-–—]?\s*(.{0,60}))?)|^((\d+(?:\.\d+)*)\s*[.:\-–—]\s*([A-Z].{0,60}))/i
  );
  if (enMatch) {
    const num = enMatch[2] || enMatch[5];
    const titleRaw = enMatch[3] || enMatch[6] || firstLine;
    return { title: titleRaw.trim(), number: num || null };
  }

  return { title: null, number: null };
}

function detectLanguage(text: string): "ko" | "en" | "mixed" {
  const koChars = (text.match(/[가-힣]/g) || []).length;
  const enChars = (text.match(/[a-zA-Z]/g) || []).length;
  if (koChars === 0 && enChars === 0) return "mixed";
  const ratio = koChars / (koChars + enChars);
  if (ratio > 0.6) return "ko";
  if (ratio < 0.1) return "en";
  return "mixed";
}

function detectRiskHints(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const kw of RISK_KEYWORDS_HIGH) {
    if (lower.includes(kw.toLowerCase())) {
      found.push(`[HIGH] ${kw}`);
    }
  }
  for (const kw of RISK_KEYWORDS_MEDIUM) {
    if (lower.includes(kw.toLowerCase())) {
      found.push(`[MEDIUM] ${kw}`);
    }
  }
  return found;
}

// ─────────────────────────────────────────
// Split into sections (contract structure first)
// ─────────────────────────────────────────
function splitIntoSections(text: string): string[] {
  // Korean: split before 제N조/장/절
  const koSplit = text.split(/(?=\n\s*제\s*\d+\s*(?:조|장|절))/);
  if (koSplit.length > 2) return koSplit.map((s) => s.trim()).filter(Boolean);

  // English: split before Article N / Section N / N. Title
  const enSplit = text.split(
    /(?=\n\s*(?:article|section|clause)\s+\d+|(?:\n\d+\.\s+[A-Z]))/i
  );
  if (enSplit.length > 2) return enSplit.map((s) => s.trim()).filter(Boolean);

  // Fallback: paragraph split
  const paragraphSplit = text.split(/\n{2,}/);
  if (paragraphSplit.length > 1) return paragraphSplit.map((s) => s.trim()).filter(Boolean);

  // Last resort: single block
  return [text.trim()];
}

// ─────────────────────────────────────────
// Re-split long sections at sentence boundaries
// ─────────────────────────────────────────
const MAX_CHUNK_CHARS = 1500;
const OVERLAP_CHARS = 150;

function splitLongSection(section: string): string[] {
  if (section.length <= MAX_CHUNK_CHARS) return [section];

  const sentences = section.match(/[^.!?。\n]+[.!?。\n]?/g) || [section];
  const subChunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > MAX_CHUNK_CHARS && current.length > 0) {
      subChunks.push(current.trim());
      // overlap: carry last OVERLAP_CHARS into next chunk
      current = current.slice(-OVERLAP_CHARS) + sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) subChunks.push(current.trim());
  return subChunks;
}

// ─────────────────────────────────────────
// Accurate charStart via cumulative offset
// ─────────────────────────────────────────
function findCharStart(fullText: string, chunk: string, searchFrom: number): number {
  const idx = fullText.indexOf(chunk.slice(0, 60), searchFrom);
  return idx === -1 ? searchFrom : idx;
}

// ─────────────────────────────────────────
// Main export
// ─────────────────────────────────────────
export function chunkText(
  text: string,
  // Legacy params kept for backward compatibility — not used internally
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _chunkSize = 500,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _overlap = 50
): TextChunk[] {
  const normalizedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ");

  const sections = splitIntoSections(normalizedText);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  let searchFrom = 0;

  for (const section of sections) {
    const subChunks = splitLongSection(section);

    for (const sub of subChunks) {
      if (!sub.trim()) continue;

      const charStart = findCharStart(normalizedText, sub, searchFrom);
      const charEnd = charStart + sub.length;

      const { title, number } = detectSectionTitle(sub);
      const language = detectLanguage(sub);
      const riskHints = detectRiskHints(sub);

      chunks.push({
        text: sub,
        index: chunkIndex,
        charStart,
        charEnd,
        sectionTitle: title,
        sectionNumber: number,
        language,
        riskHints,
      });

      searchFrom = charStart + Math.max(sub.length - OVERLAP_CHARS, 0);
      chunkIndex++;
    }
  }

  return chunks;
}

// ─────────────────────────────────────────
// Risk summary across all chunks (used in upload/route.ts)
// ─────────────────────────────────────────
export function summarizeRisk(chunks: TextChunk[]): {
  highRiskSections: string[];
  mediumRiskSections: string[];
  overallRisk: RiskLevel;
} {
  const highRiskSections: string[] = [];
  const mediumRiskSections: string[] = [];

  for (const chunk of chunks) {
    const label = chunk.sectionTitle || chunk.sectionNumber || `Chunk ${chunk.index + 1}`;
    const hasHigh = chunk.riskHints.some((h) => h.startsWith("[HIGH]"));
    const hasMedium = chunk.riskHints.some((h) => h.startsWith("[MEDIUM]"));

    if (hasHigh) highRiskSections.push(label);
    else if (hasMedium) mediumRiskSections.push(label);
  }

  const overallRisk: RiskLevel =
    highRiskSections.length > 0
      ? "high"
      : mediumRiskSections.length > 0
      ? "medium"
      : "low";

  return { highRiskSections, mediumRiskSections, overallRisk };
}