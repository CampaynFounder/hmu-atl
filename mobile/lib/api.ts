// Authenticated API client — attaches Clerk JWT to every request.
// Call getToken() from useAuth() at the call site, pass the result here.

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://atl.hmucashride.com/api';

export async function apiClient<T = unknown>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
