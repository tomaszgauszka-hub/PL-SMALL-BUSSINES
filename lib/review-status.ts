// Central document review states. A tax decision is automatic only when every
// finding is AUTO_VERIFIED; anything else stops automatic approval.
export type ReviewStatus = "AUTO_VERIFIED" | "NEEDS_USER_INPUT" | "NEEDS_EXPERT_REVIEW" | "UNSUPPORTED_OR_INVALID";
export type ReviewFinding = {
  status: ReviewStatus; code: string; message: string;
  question?: string; options?: string[]; ruleRef?: string; lineIndex?: number;
};
export type ReviewResult = { status: ReviewStatus; findings: ReviewFinding[] };

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  AUTO_VERIFIED: "Zweryfikowane",
  NEEDS_USER_INPUT: "Wymaga Twojej odpowiedzi",
  NEEDS_EXPERT_REVIEW: "Wymaga weryfikacji specjalisty",
  UNSUPPORTED_OR_INVALID: "Nieobsługiwane lub błędne",
};
const SEVERITY: Record<ReviewStatus, number> = { AUTO_VERIFIED: 0, NEEDS_USER_INPUT: 1, NEEDS_EXPERT_REVIEW: 2, UNSUPPORTED_OR_INVALID: 3 };
export function worstStatus(statuses: ReviewStatus[]): ReviewStatus {
  return statuses.reduce<ReviewStatus>((worst, status) => SEVERITY[status] > SEVERITY[worst] ? status : worst, "AUTO_VERIFIED");
}
export function reviewResult(findings: ReviewFinding[]): ReviewResult {
  return { status: worstStatus(findings.map(finding => finding.status)), findings: findings.filter(finding => finding.status !== "AUTO_VERIFIED") };
}
