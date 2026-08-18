// DB-backed demo account registry. Complements the env-var reviewer flow
// (DEMO_LOGIN_PHONE / DEMO_LOGIN_CODE) — that path is unchanged and still checked
// first; this lets a superadmin provision NEW demo accounts (any unique phone)
// with a per-account rotatable OTP-bypass code.
//
// A demo account = a REAL Clerk user + Neon users row (active, fully functional,
// NOT is_seed) + a demo_accounts registry row holding its bypass code.

import { clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export interface DemoAccount {
  id: string;
  user_id: string;
  clerk_id: string;
  phone: string;
  role: 'driver' | 'rider';
  otp_code: string;
  market_id: string | null;
  market_slug?: string | null;
  label: string | null;
  handle?: string | null;
  account_status?: string | null;
  created_at: string;
}

function norm10(value: string): string {
  const d = (value || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

/** E.164 for a US 10-digit number. Returns null if not a valid 10-digit input. */
export function toE164(phone: string): string | null {
  const ten = norm10(phone);
  return ten.length === 10 ? `+1${ten}` : null;
}

/** Human-friendly bypass code, e.g. HMU-7F2A. Ambiguous chars removed. */
export function generateOtpCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I,L,O,0,1
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `HMU-${code}`;
}

/** Look up a demo account by phone (last-10 match). Used by the sign-in bypass. */
export async function findDemoByPhone(phone: string): Promise<DemoAccount | null> {
  const ten = norm10(phone);
  if (ten.length !== 10) return null;
  const rows = await sql`
    SELECT * FROM demo_accounts WHERE phone10 = ${ten} LIMIT 1
  `;
  return (rows[0] as DemoAccount) || null;
}

/** True if the phone belongs to a DB-provisioned demo account. Async (DB). */
export async function isDbDemoPhone(phone: string | null | undefined): Promise<boolean> {
  if (!phone) return false;
  return (await findDemoByPhone(phone)) != null;
}

export async function listDemoAccounts(): Promise<DemoAccount[]> {
  const rows = await sql`
    SELECT d.*, m.slug AS market_slug,
           COALESCE(dp.handle, rp.handle) AS handle,
           u.account_status
    FROM demo_accounts d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN markets m ON m.id = d.market_id
    LEFT JOIN driver_profiles dp ON dp.user_id = d.user_id
    LEFT JOIN rider_profiles  rp ON rp.user_id = d.user_id
    ORDER BY d.created_at DESC
  `;
  return rows as DemoAccount[];
}

export interface ProvisionParams {
  phone: string;
  role: 'driver' | 'rider';
  marketId?: string | null;
  label?: string | null;
  createdBy: string;
}

/**
 * Provision a demo account for an arbitrary unique phone:
 *   1. Create (or reuse) a Clerk user with the phone pre-verified (no SMS/OTP).
 *   2. Upsert the Neon users row: correct role, active status, phone, market.
 *   3. Insert the demo_accounts registry row with a fresh bypass code.
 * Throws if the phone is already registered to a demo account or a real user.
 */
export async function provisionDemoAccount(params: ProvisionParams): Promise<DemoAccount> {
  const e164 = toE164(params.phone);
  if (!e164) throw new Error('Enter a valid 10-digit US phone number');
  const ten = norm10(e164);

  if (await findDemoByPhone(e164)) {
    throw new Error(`A demo account already exists for ${e164}`);
  }
  // Don't hijack a real user's phone.
  const clash = await sql`
    SELECT 1 FROM demo_accounts WHERE phone10 = ${ten}
    UNION ALL
    SELECT 1 FROM users u WHERE RIGHT(regexp_replace(COALESCE(u.phone,''), '\\D', '', 'g'), 10) = ${ten}
      AND NOT EXISTS (SELECT 1 FROM demo_accounts da WHERE da.user_id = u.id)
      AND u.account_status <> 'deleted'
    LIMIT 1
  `;
  if (clash.length) throw new Error(`${e164} is already in use by another account`);

  const clerk = await clerkClient();
  // Reuse an existing Clerk user for this phone if present; else create verified.
  const existing = await clerk.users.getUserList({ phoneNumber: [e164], limit: 1 });
  let clerkUser = existing.data[0];
  if (!clerkUser) {
    clerkUser = await clerk.users.createUser({
      phoneNumber: [e164],
      skipPasswordRequirement: true,
      publicMetadata: { profileType: params.role },
    });
  } else {
    await clerk.users.updateUserMetadata(clerkUser.id, { publicMetadata: { profileType: params.role } });
  }

  // Upsert the Neon row — active + correct role (profile rows are created when the
  // demo user completes onboarding via the bypass login, same as reviewer accounts).
  const userRows = await sql`
    INSERT INTO users (clerk_id, profile_type, account_status, phone, market_id)
    VALUES (${clerkUser.id}, ${params.role}, 'active', ${e164}, ${params.marketId ?? null})
    ON CONFLICT (clerk_id) DO UPDATE SET
      profile_type   = ${params.role},
      account_status = 'active',
      phone          = COALESCE(users.phone, ${e164}),
      market_id      = COALESCE(users.market_id, ${params.marketId ?? null})
    RETURNING id
  `;
  const userId = (userRows[0] as { id: string }).id;

  const otp = generateOtpCode();
  const rows = await sql`
    INSERT INTO demo_accounts (user_id, clerk_id, phone, phone10, role, otp_code, market_id, label, created_by)
    VALUES (${userId}, ${clerkUser.id}, ${e164}, ${ten}, ${params.role}, ${otp}, ${params.marketId ?? null}, ${params.label ?? null}, ${params.createdBy})
    RETURNING *
  `;
  return rows[0] as DemoAccount;
}

/** Rotate a demo account's bypass code. Returns the new code. */
export async function rotateDemoOtp(id: string): Promise<string | null> {
  const otp = generateOtpCode();
  const rows = await sql`
    UPDATE demo_accounts SET otp_code = ${otp}, updated_at = NOW() WHERE id = ${id} RETURNING id
  `;
  return rows.length ? otp : null;
}

/**
 * Delete a demo account: remove the registry row, soft-delete the Neon user, and
 * delete the Clerk user so the phone is freed. Non-destructive to ride history
 * (soft delete), reversible by re-provisioning. Returns true if a row was removed.
 */
export async function deleteDemoAccount(id: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM demo_accounts WHERE id = ${id} RETURNING user_id, clerk_id
  `;
  if (!rows.length) return false;
  const { user_id, clerk_id } = rows[0] as { user_id: string; clerk_id: string };

  await sql`
    UPDATE users SET account_status = 'deleted', deleted_at = NOW(), deletion_source = 'admin', push_token = NULL
    WHERE id = ${user_id}
  `;
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(clerk_id);
  } catch { /* best-effort — freeing the phone in Clerk is not critical */ }

  return true;
}
