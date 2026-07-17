// Shared public @handle rules. Driver + rider handles share one global
// namespace (the /d/{handle} + @handle URL space), so validation and the
// uniqueness check must be identical everywhere a handle is set — the admin
// user editor (app/api/admin/users/[id]) and the demo-account editor
// (app/api/admin/demo-data) both go through here so the rules can't drift.

import { sql } from '@/lib/db/client';

export const HANDLE_ERROR = 'Handle must be letters, numbers, _ or - (min 2 chars)';

// Trim, lowercase, strip whitespace, then enforce the allowed charset.
// Returns the normalized handle, or null if it fails the rules.
export function normalizeHandle(raw: string): string | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '');
  return /^[a-z0-9_-]{2,}$/.test(normalized) ? normalized : null;
}

// True if `normalized` is already used by any OTHER user's driver or rider
// profile. Pass the owning user's id so re-saving an unchanged handle is allowed.
export async function isHandleTaken(normalized: string, exceptUserId: string): Promise<boolean> {
  const taken = await sql`
    SELECT 1 FROM driver_profiles WHERE LOWER(REPLACE(handle, ' ', '')) = ${normalized} AND user_id <> ${exceptUserId}
    UNION ALL
    SELECT 1 FROM rider_profiles  WHERE LOWER(REPLACE(handle, ' ', '')) = ${normalized} AND user_id <> ${exceptUserId}
    LIMIT 1
  `;
  return taken.length > 0;
}
