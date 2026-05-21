export type ReleaseOverrideIssue = {
  level: "blocking";
  code: string;
  message: string;
  field?: string;
};

export type ReleaseOverride = {
  slug: string;
  issueCodes: string[];
  reviewer: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  incidentUrl?: string;
};

export type ReleaseOverrideDryRunResult = {
  ok: boolean;
  productionEffective: false;
  issues: ReleaseOverrideIssue[];
};

export const disallowedReleaseOverrideCodes: string[];

export function validateReleaseOverrideDryRun(input?: {
  override?: Partial<ReleaseOverride> | Record<string, unknown> | null;
  slug?: string;
  activeIssueCodes?: string[];
  nowMs?: number;
}): ReleaseOverrideDryRunResult;
