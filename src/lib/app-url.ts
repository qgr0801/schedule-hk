/** Address staff use to open Schedule HK (the published site). */
export const PUBLIC_APP_URL = "https://glowcare-schedule-studio.lovable.app";

/**
 * Origin to put in invitation / password e-mails. The editor preview and local dev
 * are not reachable for staff, so those fall back to the published site.
 */
export function staffAppOrigin(): string {
  if (typeof window === "undefined") return PUBLIC_APP_URL;
  const { hostname, origin } = window.location;
  const internal =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("id-preview--") || hostname.endsWith(".lovableproject.com");
  return internal ? PUBLIC_APP_URL : origin;
}
