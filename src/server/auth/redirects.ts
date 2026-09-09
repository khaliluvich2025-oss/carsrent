/**
 * Where to send someone across the sign-in boundary.
 *
 * Both directions are pure functions of a path, and both treat that path as
 * hostile: `next` arrives in a query string, and the request path can be
 * anything a visitor types. Keeping them here — rather than inline in a guard
 * and a server action — means the open-redirect rules are stated once and can
 * be tested directly.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The first path segment, when it looks like an agency slug. */
export function agencySlugFromPath(path: string): string | null {
  const slug = path.split("/")[1] ?? "";
  // "login" is a real route under an agency, never an agency itself.
  return SLUG.test(slug) && slug !== "login" ? slug : null;
}

/**
 * The sign-in page for whoever was trying to reach `path`.
 *
 * There is no platform-wide `/login`: sign-in belongs to an agency, so the slug
 * has to come from the URL. Their destination rides along in `?next=` so a
 * session that expired mid-task resumes where it stopped. Falls back to the
 * platform root when the path names no agency.
 */
export function signInPath(path: string): string {
  const slug = agencySlugFromPath(path);
  if (!slug) return "/";

  const target = `/${slug}/login`;
  if (!path.startsWith(`/${slug}/`) || path.startsWith(target)) return target;
  return `${target}?next=${encodeURIComponent(path)}`;
}

/**
 * Where to land after signing in.
 *
 * Only a plain path inside this same agency is honoured, which rules out
 * absolute URLs (`//evil.example`, `https://…`), backslash tricks, and a hop
 * into another tenant. Anything else quietly becomes the dashboard.
 */
export function landingPath(agencySlug: string, next: string): string {
  const home = `/${agencySlug}/dashboard`;
  if (!next.startsWith(`/${agencySlug}/`)) return home;
  if (next.startsWith("//") || next.includes("\\")) return home;
  if (next === `/${agencySlug}/login`) return home;
  return next;
}
