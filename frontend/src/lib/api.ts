export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api";

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
  timeoutMs = 30000
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      // Read body ONCE to avoid "body stream already read"
      const raw = await res.text();
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          const j = raw ? JSON.parse(raw) : {};
          const msg =
            (typeof (j as any)?.detail === "string" && (j as any).detail) ||
            (typeof (j as any)?.message === "string" && (j as any).message) ||
            (raw || "");
          throw new Error(msg || `Request failed: ${res.status}`);
        } catch (e: any) {
          if (e.message && !e.message.startsWith("Request failed")) throw e;
          throw new Error(raw || `Request failed: ${res.status}`);
        }
      }
      throw new Error(raw || `Request failed: ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw e;
  }
}
