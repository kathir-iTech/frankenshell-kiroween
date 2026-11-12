export type Variant = "original" | "shortcut" | "corrected";
export type CasePack = {
  schemaVersion: number;
  id: string;
  title: string;
  subtitle: string;
  description: string;
  tag: string;
  contract: string;
  input: unknown;
  sources: Record<Variant, string>;
  candidateOrigin: string;
  limits: { inputBytes: number; outputBytes: number; executionMs: number };
};
export type Check = {
  id: string;
  label: string;
  status: "passed" | "failed";
  expected: unknown;
  actual: unknown;
};
export type Result = {
  output: unknown;
  error: { type: string; message: string } | null;
  traceback: string | null;
  stdout: string;
  checks: Check[];
  passed: boolean;
  counterexample: Check | null;
};
export type Report = {
  schemaVersion: number;
  caseId: string;
  input: unknown;
  candidateOrigin: string;
  executionOrigin: string;
  failureReproduced: boolean;
  results: Partial<Record<Variant, Result>>;
  verifiedCandidates: Variant[];
};
