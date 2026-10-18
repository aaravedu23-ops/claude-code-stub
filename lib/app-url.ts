/**
 * The site's public URL. BETTER_AUTH_URL wins; on Vercel it falls back to the
 * production domain, and locally to localhost.
 */
export function appUrl() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Vercel gives every deployment and branch its own domain; sign-in should work on all of them. */
export function vercelOrigins() {
  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((h): h is string => Boolean(h))
    .map((h) => `https://${h}`);
}
