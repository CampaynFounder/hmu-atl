import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export type AdminAuthOk = { userId: string; error?: never };
export type AdminAuthErr = { error: NextResponse; userId?: never };
export type AdminAuthResult = AdminAuthOk | AdminAuthErr;

export async function requireAdmin(): Promise<AdminAuthResult> {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const claims = (sessionClaims ?? {}) as Record<string, unknown>;
  const meta = (claims.publicMetadata ?? claims.metadata ?? {}) as Record<string, unknown>;
  const role = meta.role;

  if (role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { userId };
}
