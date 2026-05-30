// lib/contractTypes.ts
// Per-contract-type risk calibration — shared between upload and chat routes

export type ContractType =
  | "employment"
  | "nda"
  | "saas"
  | "freelance"
  | "partnership"
  | "lease"
  | "general";

// ─────────────────────────────────────────
// Per-type HIGH risk keywords
// ─────────────────────────────────────────
const TYPE_HIGH_RISK: Record<ContractType, string[]> = {
  employment: [
    "non-compete", "non-solicitation", "assign all rights", "work for hire",
    "intellectual property assignment", "at-will termination", "without notice",
    "unlimited overtime", "sole discretion", "automatic renewal",
    "경업금지", "지식재산권 양도", "즉시해고", "무한책임",
  ],
  nda: [
    "perpetual", "irrevocable", "unlimited liability", "assign all rights",
    "unilateral", "without notice", "forfeit", "waiver",
    "영구적", "취소불가", "권리포기", "일방적",
  ],
  saas: [
    "automatic renewal", "unilateral", "unlimited liability", "irrevocable",
    "perpetual license", "assign all rights", "terminate immediately",
    "without notice", "sole discretion", "waive",
    "자동갱신", "무한책임", "취소불가", "즉시해지",
  ],
  freelance: [
    "work for hire", "assign all rights", "intellectual property assignment",
    "non-compete", "unlimited liability", "indemnif", "liquidated damages",
    "penalty", "sole discretion", "without notice",
    "경업금지", "지식재산권 양도", "위약금", "무한책임",
  ],
  partnership: [
    "irrevocable", "perpetual", "unlimited liability", "waiver",
    "forfeit", "unilateral", "sole discretion", "assign all rights",
    "without notice", "automatic renewal",
    "취소불가", "영구적", "권리포기", "무한책임",
  ],
  lease: [
    "automatic renewal", "without notice", "forfeit", "waiver",
    "liquidated damages", "penalty", "unilateral", "irrevocable",
    "자동갱신", "위약금", "권리포기", "취소불가",
  ],
  general: [
    "indemnif", "unlimited liability", "sole discretion", "irrevocable",
    "perpetual", "waive", "waiver", "forfeit", "penalty", "liquidated damages",
    "automatic renewal", "unilateral", "terminate immediately", "without notice",
    "non-compete", "non-solicitation", "intellectual property assignment",
    "assign all rights", "work for hire",
    "무한책임", "단독재량", "취소불가", "영구적", "권리포기", "위약금",
    "자동갱신", "일방적", "즉시해지", "경업금지", "지식재산권 양도",
  ],
};

// ─────────────────────────────────────────
// Per-type MEDIUM risk keywords
// ─────────────────────────────────────────
const TYPE_MEDIUM_RISK: Record<ContractType, string[]> = {
  employment: [
    "arbitration", "governing law", "jurisdiction", "confidential",
    "non-disclosure", "limitation of liability", "force majeure",
    "중재", "준거법", "비밀유지", "책임제한",
  ],
  nda: [
    "governing law", "jurisdiction", "arbitration", "limitation of liability",
    "at our discretion", "may modify", "force majeure",
    "준거법", "중재", "재량에 따라", "불가항력",
  ],
  saas: [
    "limitation of liability", "as-is", "no warranty", "disclaimer",
    "arbitration", "governing law", "jurisdiction", "may modify",
    "subject to change", "confidential",
    "책임제한", "보증없음", "면책", "중재", "변경될 수 있",
  ],
  freelance: [
    "arbitration", "governing law", "limitation of liability", "confidential",
    "non-disclosure", "force majeure", "at our discretion",
    "중재", "준거법", "책임제한", "비밀유지",
  ],
  partnership: [
    "arbitration", "governing law", "limitation of liability", "confidential",
    "force majeure", "at our discretion", "may modify",
    "중재", "준거법", "책임제한", "불가항력",
  ],
  lease: [
    "arbitration", "governing law", "limitation of liability", "force majeure",
    "at our discretion", "may modify", "confidential",
    "중재", "준거법", "책임제한", "불가항력",
  ],
  general: [
    "notwithstanding", "at our discretion", "may modify", "subject to change",
    "arbitration", "governing law", "jurisdiction", "force majeure",
    "limitation of liability", "as-is", "no warranty", "disclaimer",
    "confidential", "non-disclosure",
    "재량에 따라", "변경될 수 있", "중재", "준거법", "관할", "불가항력",
    "책임제한", "보증없음", "면책", "비밀유지", "기밀",
  ],
};

// ─────────────────────────────────────────
// Per-type system prompt additions for Claude
// ─────────────────────────────────────────
export const TYPE_PROMPT_CONTEXT: Record<ContractType, string> = {
  employment: `This is an EMPLOYMENT CONTRACT. Pay special attention to:
- Non-compete and non-solicitation clauses (scope, duration, geography)
- IP assignment — does it cover work done outside work hours?
- Termination conditions — is it at-will? What notice is required?
- Compensation structure and any clawback provisions
- Overtime and work hour requirements`,

  nda: `This is an NDA / CONFIDENTIALITY AGREEMENT. Pay special attention to:
- Duration of confidentiality obligations (perpetual NDAs are high risk)
- Scope of "Confidential Information" — is it overly broad?
- Exclusions from confidentiality (standard ones protect the receiving party)
- Return or destruction of information requirements
- Residuals clauses that may allow use of retained knowledge`,

  saas: `This is a SAAS / SOFTWARE AGREEMENT. Pay special attention to:
- Auto-renewal clauses and cancellation notice periods
- Limitation of liability caps — are they reasonable?
- Data ownership and portability on termination
- SLA terms and remedies for downtime
- Unilateral modification rights (can the vendor change terms without consent?)`,

  freelance: `This is a FREELANCE / SERVICE AGREEMENT. Pay special attention to:
- IP ownership — "work for hire" means the client owns everything
- Payment terms and late payment penalties
- Scope creep provisions — can the client expand scope without extra pay?
- Non-compete restrictions that could limit future work
- Indemnification obligations on the freelancer`,

  partnership: `This is a PARTNERSHIP / EQUITY AGREEMENT. Pay special attention to:
- Equity dilution provisions
- Decision-making authority and veto rights
- Exit and buyout clauses
- Non-compete obligations post-dissolution
- IP ownership if the partnership dissolves`,

  lease: `This is a LEASE / RENTAL AGREEMENT. Pay special attention to:
- Auto-renewal clauses and required notice to terminate
- Penalty and forfeiture clauses
- Maintenance and repair obligations
- Early termination fees
- Rent escalation provisions`,

  general: `Analyze this contract for general risk. Pay attention to:
- Any clauses that create unlimited or disproportionate liability
- Unilateral modification or termination rights
- Auto-renewal with inadequate notice periods
- IP assignment beyond what is reasonable
- Arbitration clauses that waive jury trial rights`,
};

// ─────────────────────────────────────────
// Exports for use in upload/route.ts and chat/route.ts
// ─────────────────────────────────────────
export function getHighRiskKeywords(type: ContractType): string[] {
  return TYPE_HIGH_RISK[type] ?? TYPE_HIGH_RISK.general;
}

export function getMediumRiskKeywords(type: ContractType): string[] {
  return TYPE_MEDIUM_RISK[type] ?? TYPE_MEDIUM_RISK.general;
}

export function getTypePromptContext(type: ContractType): string {
  return TYPE_PROMPT_CONTEXT[type] ?? TYPE_PROMPT_CONTEXT.general;
}