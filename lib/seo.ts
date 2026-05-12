export function getBaseUrl() {
  const raw = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    ""
  ).trim();
  if (raw) {
    const normalized = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    try {
      return new URL(normalized);
    } catch {
      // Fallback to local URL when env value is invalid
    }
  }
  return new URL(process.env.URL ?? "http://localhost:3515");
}
