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
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
