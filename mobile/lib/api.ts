// Authenticated API client — attaches Clerk JWT to every request.
// Call getToken() from useAuth() at the call site, pass the result here.

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://atl.hmucashride.com/api';

export async function apiClient<T = unknown>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const method = ((options.method as string | undefined) ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  // Only set Content-Type on requests that have a body — sending it on GET
  // requests causes Cloudflare Workers to return HTML error responses.
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  Object.assign(headers, options.headers ?? {});

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Friendly messages keyed by status — parse API body for extra detail first
    let apiMsg: string | null = null;
    try {
      const body = JSON.parse(text);
      apiMsg = body?.error ?? body?.message ?? null;
    } catch { /* not JSON */ }
    if (res.status === 401) throw new Error(apiMsg ?? 'You need to be signed in. Restart the app and try again.');
    if (res.status === 403) throw new Error(apiMsg ?? "You're not able to do that right now. Check your account status or contact support.");
    if (res.status === 429) throw new Error(apiMsg ?? "Slow down a sec — you're doing that too fast. Try again in a moment.");
    if (res.status >= 500) throw new Error(apiMsg ?? 'Something went wrong on our end. Try again in a bit.');
    throw new Error(apiMsg ?? text ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
