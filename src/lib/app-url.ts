/** Canonical address used by all Supabase invite and recovery flows. */
export function staffPasswordSetupUrl(): string {
  const configuredOrigin = import.meta.env.VITE_APP_URL;
  const url = URL.canParse(configuredOrigin ?? "") ? new URL(configuredOrigin) : null;
  const isLocalHttp =
    url?.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  if (
    !url ||
    (url.protocol !== "https:" && !isLocalHttp) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("VITE_APP_URL에 올바른 사이트 주소를 설정해 주세요.");
  }

  return new URL("/set-password", url.origin).href;
}
