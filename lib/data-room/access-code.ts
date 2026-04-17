import { sql } from '@/lib/db/client';

const CONFIG_KEY = 'data_room_access_code';
// Fail-closed: if no DB row and no env var, reject everything.
// Super admin must set a code via /admin/data-room → Settings.
const FALLBACK = '';

/**
 * Resolve the current data room access code.
 * Priority: platform_config → env var → hardcoded fallback.
 */
export async function getDataRoomAccessCode(): Promise<string> {
  try {
    const rows = await sql`
      SELECT config_value FROM platform_config WHERE config_key = ${CONFIG_KEY} LIMIT 1
    `;
    const value = rows.length
      ? (rows[0] as { config_value: { code?: string } }).config_value?.code
      : undefined;
    if (value && typeof value === 'string' && value.length > 0) return value;
  } catch {
    // fall through to env/fallback on any DB error
  }
  return process.env.DATA_ROOM_ACCESS_CODE || FALLBACK;
}

export async function setDataRoomAccessCode(code: string, updatedBy: string): Promise<void> {
  await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${CONFIG_KEY}, ${JSON.stringify({ code })}::jsonb, ${updatedBy}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `;
}

export async function getDataRoomAccessCodeMeta(): Promise<{
  code: string;
  source: 'db' | 'env' | 'default';
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  try {
    const rows = await sql`
      SELECT config_value, updated_at, updated_by
      FROM platform_config WHERE config_key = ${CONFIG_KEY} LIMIT 1
    `;
    if (rows.length) {
      const row = rows[0] as {
        config_value: { code?: string };
        updated_at: string;
        updated_by: string | null;
      };
      const code = row.config_value?.code;
      if (code) {
        return {
          code,
          source: 'db',
          updatedAt: row.updated_at,
          updatedBy: row.updated_by,
        };
      }
    }
  } catch {
    // fall through
  }
  const envCode = process.env.DATA_ROOM_ACCESS_CODE;
  return {
    code: envCode || FALLBACK,
    source: envCode ? 'env' : 'default',
    updatedAt: null,
    updatedBy: null,
  };
}
