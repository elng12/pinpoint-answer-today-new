/**
 * Shared admin authentication tokens.
 *
 * Used by /api/admin/generate-draft and /api/admin/validate-draft
 * to avoid duplicating the token list.
 */

import { createHash, timingSafeEqual } from "node:crypto";

const ADMIN_TOKENS = [
  process.env.API_SECRET_TOKEN,
  process.env.ADMIN_PASSPHRASE,
  process.env.NODE_ENV === "production" ? null : process.env.DEV_ADMIN_TOKEN,
].filter(Boolean) as string[];

if (
  process.env.NODE_ENV !== "production" &&
  (process.env.DEV_ADMIN_TOKEN === "admin-secret-dev" ||
    process.env.DEV_ADMIN_TOKEN === "change-me-to-a-random-string")
) {
  console.warn("[admin-auth] DEV_ADMIN_TOKEN is using a weak placeholder value.");
}

function hashSecret(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(hashSecret(a), hashSecret(b));
}

export function authenticateAdmin(token: string): boolean {
  return ADMIN_TOKENS.some((adminToken) => safeEqual(token, adminToken));
}

export { ADMIN_TOKENS };
