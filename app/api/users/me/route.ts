import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

/** GET /api/users/me — resolve Clerk ID to internal user ID + profile type + driver handle */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // One query joins the user with their driver handle so /d/[handle] can cheaply
  // check "is this page about me?" without a second fetch.
  const rows = await sql`
    SELECT u.id, u.profile_type, u.account_status, dp.handle AS driver_handle
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;

  // Staging fallback: if user doesn't exist (webhook didn't fire), create a stub rider record
  if (!rows.length) {
    const newUserRows = await sql`
      INSERT INTO users (clerk_id, profile_type, account_status)
      VALUES (${clerkId}, 'rider', 'active')
      RETURNING id, profile_type, account_status
    `;
    const newUser = newUserRows[0] as { id: string; profile_type: string; account_status: string };
    return NextResponse.json({
      id: newUser.id,
      profileType: newUser.profile_type,
      accountStatus: newUser.account_status,
      driverHandle: null,
    });
  }

  const user = rows[0] as {
    id: string;
    profile_type: string;
    account_status: string;
    driver_handle: string | null;
  };
  return NextResponse.json({
    id: user.id,
    profileType: user.profile_type,
    accountStatus: user.account_status,
    driverHandle: user.driver_handle || null,
  });
}
