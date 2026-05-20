type UrlAllowlistRule = {
  allowedSchemes: readonly string[];
  allowedHosts?: readonly string[];
  allowedHostSuffixes?: readonly string[];
  allowAnyHost?: boolean;
  allowLocalhost?: boolean;
};

const LOCALHOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function normalizeHostname(hostname: string): string {
  return hostname.trim().replace(/\.$/, "").toLowerCase();
}

function isLocalhost(hostname: string): boolean {
  return LOCALHOSTS.has(normalizeHostname(hostname));
}

function matchesHostSuffix(hostname: string, suffix: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  const normalizedSuffix = suffix.startsWith(".")
    ? suffix.toLowerCase()
    : `.${suffix.toLowerCase()}`;
  return normalizedHost.endsWith(normalizedSuffix);
}

export function validateUrlAgainstAllowlist(
  url: URL,
  rule: UrlAllowlistRule,
  label: string,
): void {
  if (url.username || url.password) {
    throw new Error(`URL allowlist [${label}]: credentials are not allowed`);
  }

  if (rule.allowLocalhost && isLocalhost(url.hostname)) {
    if (url.protocol === "http:" || url.protocol === "https:") {
      return;
    }
    throw new Error(`URL allowlist [${label}]: scheme ${url.protocol} is not allowed`);
  }

  if (!rule.allowedSchemes.includes(url.protocol)) {
    throw new Error(`URL allowlist [${label}]: scheme ${url.protocol} is not allowed`);
  }

  const allowedHosts = (rule.allowedHosts ?? []).map(normalizeHostname);
  const host = normalizeHostname(url.hostname);
  const hostOk =
    rule.allowAnyHost === true ||
    allowedHosts.includes(host) ||
    (rule.allowedHostSuffixes ?? []).some((suffix) => matchesHostSuffix(host, suffix));

  if (!hostOk) {
    throw new Error(`URL allowlist [${label}]: host ${url.hostname} is not allowed`);
  }
}

export function parseAndValidateUrl(
  raw: string,
  rule: UrlAllowlistRule,
  label: string,
): URL {
  const url = new URL(raw);
  validateUrlAgainstAllowlist(url, rule, label);
  return url;
}
