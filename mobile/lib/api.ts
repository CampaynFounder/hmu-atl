// Authenticated API client — attaches Clerk JWT to every request.
// Call getToken() from useAuth() at the call site, pass the result here.

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://atl.hmucashride.com/api';

// Hard ceiling on any request. Without this a hung origin (Neon connection
// stall, CF holding the socket) leaves the caller's promise pending forever —
// which is exactly how a submit button spins indefinitely. 30s is generous for
// our slowest endpoint; anything past it is a failure the user should see.
const REQUEST_TIMEOUT_MS = 30_000;

// Error thrown on any non-ok response. Carries the HTTP status and the API's
// machine-readable `code` (e.g. 'payment_failed', 'no_payment_method') so
// callers can branch on the failure kind instead of string-matching the
// message. `message` stays human-readable for direct display.
export class ApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('That took too long. Check your connection and try again.');
    }
    throw new Error(e?.message ?? 'Network error. Try again.');
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Friendly messages keyed by status — parse API body for extra detail first
    let apiMsg: string | null = null;
    let apiCode: string | null = null;
    try {
      const body = JSON.parse(text);
      apiMsg = body?.error ?? body?.message ?? null;
      apiCode = (body?.code as string | undefined) ?? null;
    } catch { /* not JSON */ }
    const status = res.status;
    if (status === 401) throw new ApiError(apiMsg ?? 'You need to be signed in. Restart the app and try again.', status, apiCode);
    if (status === 403) throw new ApiError(apiMsg ?? "You're not able to do that right now. Check your account status or contact support.", status, apiCode);
    if (status === 429) throw new ApiError(apiMsg ?? "Slow down a sec — you're doing that too fast. Try again in a moment.", status, apiCode);
    if (status >= 500) throw new ApiError(apiMsg ?? 'Something went wrong on our end. Try again in a bit.', status, apiCode);
    throw new ApiError(apiMsg ?? text ?? `Request failed (${status})`, status, apiCode);
  }
  return res.json() as Promise<T>;
}
